let chartInstance = null;
const datasetMap = new Map();
const defaultColors = [
    '#0000FF', '#FFA500', '#888888', '#00AA00',
    '#9739A8', '#E53935', '#20B2C2', '#3F51B5', '#00796B', '#D81B60'
];

const minDayInput = document.getElementById('minDay');
const maxDayInput = document.getElementById('maxDay');
const minFSInput = document.getElementById('minFS');
const maxFSInput = document.getElementById('maxFS');

let initialRanges = {
    minDay: undefined, maxDay: undefined,
    minFS: undefined, maxFS: undefined
};

// 綁定輸入框更新事件
[minDayInput, maxDayInput, minFSInput, maxFSInput].forEach(input => {
    input.addEventListener('blur', () => { if (datasetMap.size > 0) drawChart(); });
    input.addEventListener('keypress', e => {
        if (e.key === 'Enter' && datasetMap.size > 0) drawChart();
    });
});

function resetField(id) {
    document.getElementById(id).value = '';
    if (datasetMap.size > 0) drawChart();
}

function resetAllRanges() {
    minDayInput.value = '';
    maxDayInput.value = '';
    minFSInput.value = '';
    maxFSInput.value = '';
    if (datasetMap.size > 0) drawChart();
}

// 解析 CSV/Excel 資料的強大通用函式 (相容 4 種格式)
function parseDataLines(rows) {
    let validColsList = [];
    let indexCounter = 0;

    // 先過濾出所有包含有效資料的行 (排除空行與 Header)
    for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        let cols = [];

        if (Array.isArray(row)) {
            cols = row.map(c => String(c).trim());
        } else {
            let line = String(row).trim();
            if (!line) continue;
            cols = line.split(',').map(c => c.trim());
        }

        if (cols.length === 0 || cols[0] === "") continue;

        let num0 = parseFloat(cols[0]);
        // 略過 Header (例如字串 "days", "FS")
        if (isNaN(num0)) continue;

        validColsList.push(cols);
    }

    // 檢查最後兩行內容是否完全一樣
    let duplicateRemoved = false;
    if (validColsList.length >= 2) {
        let last = validColsList[validColsList.length - 1];
        let secondLast = validColsList[validColsList.length - 2];
        
        // 比對兩行內容是否相同
        let isSame = last.length === secondLast.length && last.every((val, index) => val === secondLast[index]);
        
        if (isSame) {
            validColsList.pop(); // 剔除最後一行重複的資料
            duplicateRemoved = true;
        }
    }

    // 開始解析為 X, Y 座標點
    let parsed = [];
    for (let i = 0; i < validColsList.length; i++) {
        let cols = validColsList[i];
        let num0 = parseFloat(cols[0]);
        let num1 = cols.length > 1 ? parseFloat(cols[1]) : NaN;

        let x, y;
        if (!isNaN(num0) && !isNaN(num1)) {
            // 格式 1 & 2: [index/days, FS, ...]
            x = num0;
            y = num1;
            indexCounter = x + 1; // 同步計數器
        } else if (!isNaN(num0) && isNaN(num1)) {
            // 格式 3 & 4: [FS] 單獨一欄
            x = indexCounter++;
            y = num0;
        } else {
            continue;
        }
        
        parsed.push({ x, y });
    }

    // 確保資料依據 X 軸 (天數) 排序，繪製折線圖才不會亂跳
    parsed.sort((a, b) => a.x - b.x);
    
    // 回傳資料陣列以及「是否有刪除重複行」的標記
    return { parsedData: parsed, duplicateRemoved: duplicateRemoved };
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        let fileName = file.name;
        
        // 處理重複檔名：若名稱已存在，自動加上 (1), (2)... 後綴
        let counter = 1;
        let originalName = fileName;
        while (datasetMap.has(fileName)) {
            const parts = originalName.split('.');
            if (parts.length > 1) {
                const ext = parts.pop(); // 取出副檔名
                fileName = parts.join('.') + `(${counter}).` + ext;
            } else {
                fileName = originalName + `(${counter})`;
            }
            counter++;
        }

        try {
            const extension = fileName.split('.').pop().toLowerCase();
            let parsedData = [];
            let parseResult = null;

            if (extension === 'csv') {
                const text = await file.text();
                const lines = text.split(/\r?\n/);
                parseResult = parseDataLines(lines);
            } else if (extension === 'xlsx' || extension === 'xls') {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                parseResult = parseDataLines(json);
            } else {
                console.error(`不支援的檔案格式: ${fileName}`);
                continue;
            }

            // 取得解析結果並判斷是否需要跳出提醒
            if (parseResult) {
                parsedData = parseResult.parsedData;
                
                if (parseResult.duplicateRemoved) {
                    alert(`【提醒】檔案「${file.name}」的最後兩行資料完全相同！\n系統已自動刪除最後一筆重複資料，並使用修正後的資料進行畫圖與計算。`);
                }
            }

            if (parsedData.length > 0) {
                const color = defaultColors[datasetMap.size % defaultColors.length] || '#000000';
                const defaultName = fileName.replace(/\.[^/.]+$/, ""); // 預設拿掉副檔名作為名稱
                
                datasetMap.set(fileName, {
                    name: defaultName,
                    data: parsedData,
                    color: color,
                    simplifiedName: fileName,
                    pointRadius: 2, // 預設粗細/點大小
                    opacity: 1
                });
                addFileEntryUI(fileName, color);
            }
        } catch (error) {
            console.error(`處理檔案 ${file.name} 時發生錯誤:`, error);
        }
    }

    if (datasetMap.size > 0) {
        drawChart();
        document.getElementById('resetColorsBtn').style.display = 'inline-block';
    } else {
        alert('沒有成功載入任何有效的資料');
    }
    updateFileCount();
    event.target.value = ''; // 允許重新上傳同名檔案
}

function updateFileCount() {
    document.getElementById('fileCount').textContent = `已上傳 ${datasetMap.size} 個檔案`;
    document.getElementById('toggleListBtn').style.display = datasetMap.size > 0 ? 'inline-block' : 'none';
}

// 新增：根據網頁 DOM 順序重新排序 Map，這樣 Chart.js 和表格的順序才會跟著變
function reorderDatasetMap() {
    const newMap = new Map();
    const domEntries = document.querySelectorAll('.file-entry');

    domEntries.forEach(entry => {
        const fileName = entry.dataset.filename; // 從 data-attribute 抓取原始檔名
        if (datasetMap.has(fileName)) {
            newMap.set(fileName, datasetMap.get(fileName));
        }
    });

    // 清空舊 Map，用新順序填入
    datasetMap.clear();
    newMap.forEach((val, key) => datasetMap.set(key, val));
    drawChart(); // 重新畫圖與計算表格
}

document.addEventListener('DOMContentLoaded', () => {
const fileInput = document.getElementById('csvFileInput');
const uploadBtn = document.getElementById('uploadBtn');
const toggleListBtn = document.getElementById('toggleListBtn');
const fileListContainer = document.getElementById('fileListContainer');

fileInput.addEventListener('change', handleFileUpload);
uploadBtn.addEventListener('click', () => fileInput.click());

// 收合/展開按鈕事件
toggleListBtn.addEventListener('click', () => {
    fileListContainer.classList.toggle('collapsed');
    if (fileListContainer.classList.contains('collapsed')) {
        toggleListBtn.textContent = '展開列表';
    } else {
        toggleListBtn.textContent = '收合列表';
    }
});

// 實作拖曳排序放置區邏輯
fileListContainer.addEventListener('dragover', e => {
    e.preventDefault(); // 允許放置
    const afterElement = getDragAfterElement(fileListContainer, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (afterElement == null) {
        fileListContainer.appendChild(draggable);
    } else {
        fileListContainer.insertBefore(draggable, afterElement);
    }
});

updateFileCount();
});

// 輔助函式：計算拖曳時游標位置在上方還是下方，決定插入位置
function getDragAfterElement(container, y) {
const draggableElements = [...container.querySelectorAll('.file-entry:not(.dragging)')];
return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
    } else {
        return closest;
    }
}, { offset: Number.NEGATIVE_INFINITY }).element;
}

// 下載.csv檔
function downloadAllDetailedCSV() {
    if (datasetMap.size === 0) {
        alert("目前沒有資料可以下載！");
        return;
    }

    let csvContent = "";

    // 走訪所有已上傳的檔案
    datasetMap.forEach((info, fileName) => {
        const metInfor = info.metrics;
        if (!metInfor) return;

        let x_sign = metInfor.high_trend_line[1] > 0 ? "+" : "";

        csvContent += `${info.name}\n`;
        csvContent += "===== Trend =====\n";
        csvContent += `Days:,${metInfor.days}\n`;
        csvContent += `Trend line:,${metInfor.high_trend_line[0]} x² ${x_sign}${metInfor.high_trend_line[1]} x + ${metInfor.init_fund}\n`;
        csvContent += `Risk:,${metInfor.risk}\n`;
        csvContent += `ExpectedReturn:,${metInfor.exp_return}\n`;
        csvContent += `TrendRatio:,${metInfor.trend_ratio}\n`;
        
        csvContent += "===== Emotional Index =====\n";
        csvContent += `Init FS:,${metInfor.init_fund}\n`;
        csvContent += `Final FS:,${metInfor.final_FS}\n`;
        csvContent += `Profit:,${metInfor.emo_profit}\n`;
        csvContent += `Daily flu:,${metInfor.flu}\n`;
        csvContent += `EI:,${metInfor.emotional_index}\n`;

        csvContent += "===== Maximum Drawdown =====\n";
        csvContent += `Peak:,${metInfor.peakVal},at Day ${metInfor.peakDay}\n`;
        csvContent += `Valley:,${metInfor.valleyVal},at Day ${metInfor.valleyDay}\n`;
        csvContent += `MDD:,${metInfor.mddPercent}%\n\n`;
    });

    // 加上 BOM 標記，確保 Excel 用 UTF-8 開啟時中文字不會變成亂碼
    const BOM = "\uFEFF"; 
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `All_FS_indicator_results.csv`); // 統一下載檔名
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
//  UI 建立邏輯 (完全保留原本的複雜調色盤與排版)
// ==========================================
let modalCounter = 0;

function addFileEntryUI(fileName, defaultColor) {
    const container = document.getElementById('fileListContainer');
    const entry = document.createElement('div');
    entry.className = 'file-entry';
    entry.id = `entry-${CSS.escape(fileName)}`;
    
    // 新增：為了能在重排時找回檔名，將檔名存在 dataset 中
    entry.dataset.filename = fileName;
    
    // 新增：允許拖曳
    entry.draggable = true;
    
    // 新增：拖曳手把
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '☰';
    
    // 新增：拖曳開始與結束事件
    entry.addEventListener('dragstart', () => {
        entry.classList.add('dragging');
    });
    
    entry.addEventListener('dragend', () => {
        entry.classList.remove('dragging');
        reorderDatasetMap(); // 拖曳結束後，依照新順序更新資料與圖表
    });

    const colorPreview = document.createElement('div');
    colorPreview.className = 'color-preview-box-list';
    colorPreview.style.backgroundColor = defaultColor;
    colorPreview.style.opacity = datasetMap.get(fileName).opacity || 1;
    colorPreview.title = '點擊選擇顏色';

    const modalId = `color-picker-${modalCounter++}`;
    const modal = document.createElement('div');
    modal.className = 'color-picker-modal';
    modal.style.display = 'none';
    
    // 原封不動的調色盤 HTML
    modal.innerHTML = `
        <div class="color-picker-tabs">
            <button data-tab="common" class="active">常用顏色</button>
            <button data-tab="hexrgb">HEX & RGB</button>
            <button data-tab="native">原生選擇器</button>
        </div>
        <div class="color-picker-content active" id="${modalId}-common">
            <div class="common-colors">
                ${[
            ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#5B9BD5', '#4472C4', '#002060', '#7030A0'],
            ['#FFE6E6', '#FF6666', '#FFF2CC', '#FFFF99', '#CCFF99', '#99FFCC', '#B3CDEB', '#A3BFFA', '#99A3CC', '#C2A3CC'],
            ['#FFCCCC', '#FF3333', '#FFE699', '#FFFF66', '#B3E67A', '#66FF99', '#99BCE2', '#8AA7FA', '#667AB3', '#AD80BF'],
            ['#FF9999', '#CC0000', '#FFD966', '#CCCC00', '#8CCB5E', '#33CC66', '#7FAAD8', '#7088F5', '#335099', '#985EAD'],
            ['#B30000', '#990000', '#BF9000', '#999900', '#6B9B44', '#26994D', '#4C739B', '#3957A6', '#263C66', '#5E3A73']
        ].map(column => column.map(color => `<div class="color-swatch" style="background-color: ${color};" data-color="${color}"></div>`).join('')).join('')}
            </div>
        </div>
        <div class="color-picker-content" id="${modalId}-hexrgb">
            <div class="hexrgb-inputs">
                <label><span>紅 :</span>
                    <div class="rgb-preview-box" style="background-color: rgb(${parseInt(defaultColor.slice(1, 3), 16)}, 0, 0);"></div>
                    <input type="range" min="0" max="255" value="${parseInt(defaultColor.slice(1, 3), 16)}" class="rgb-slider">
                    <input type="number" min="0" max="255" value="${parseInt(defaultColor.slice(1, 3), 16)}" class="rgb-number">
                </label>
                <label><span>綠 :</span>
                    <div class="rgb-preview-box" style="background-color: rgb(0, ${parseInt(defaultColor.slice(3, 5), 16)}, 0);"></div>
                    <input type="range" min="0" max="255" value="${parseInt(defaultColor.slice(3, 5), 16)}" class="rgb-slider">
                    <input type="number" min="0" max="255" value="${parseInt(defaultColor.slice(3, 5), 16)}" class="rgb-number">
                </label>
                <label><span>藍 :</span>
                    <div class="rgb-preview-box" style="background-color: rgb(0, 0, ${parseInt(defaultColor.slice(5, 7), 16)});"></div>
                    <input type="range" min="0" max="255" value="${parseInt(defaultColor.slice(5, 7), 16)}" class="rgb-slider">
                    <input type="number" min="0" max="255" value="${parseInt(defaultColor.slice(5, 7), 16)}" class="rgb-number">
                </label>
                <label><span>不透明度 :</span>
                    <input type="range" min="0" max="1" step="0.01" value="${datasetMap.get(fileName).opacity || 1}" class="opacity-slider">
                    <input type="number" min="0" max="100" step="1" value="${Math.round((datasetMap.get(fileName).opacity || 1) * 100)}" class="opacity-number">%
                </label>
                <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                    <span>十六進位表示 :</span>
                    <div class="color-preview-box live-preview" style="background-color: ${defaultColor}; opacity: ${datasetMap.get(fileName).opacity || 1};"></div>
                    <input type="text" class="hex-input" placeholder="#FFFFFF" value="${defaultColor}" style="width: 100px;">
                    <button class="confirm-btn">更新</button>
                </div>
            </div>
        </div>
        <div class="color-picker-content" id="${modalId}-native">
            <input type="color" class="native-color-input" value="${defaultColor}" style="width: 115px; height: 40px; border: none; outline: none; cursor: pointer; background: transparent; padding: 0;">
        </div>
    `;

    entry.appendChild(modal);

    // Tab 切換與事件綁定 (與原版相同)
    const tabs = modal.querySelectorAll('.color-picker-tabs button');
    const contents = modal.querySelectorAll('.color-picker-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const content = modal.querySelector(`#${modalId}-${tab.dataset.tab}`);
            if (content) content.classList.add('active');
        });
    });

    const colorSwatches = modal.querySelectorAll('.color-swatch');
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.getAttribute('data-color');
            const opacity = parseFloat(modal.querySelector(`#${modalId}-hexrgb .opacity-number`).value) / 100 || 1;
            updateColor(color, opacity);
        });
    });

    // 線條粗細/點大小輸入框
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.className = 'point-radius-input';
    radiusInput.min = '1';
    radiusInput.max = '12';
    radiusInput.step = '1';
    radiusInput.value = datasetMap.get(fileName).pointRadius || 2;
    radiusInput.style.width = '36px';
    radiusInput.style.height = '20px';
    radiusInput.style.fontSize = '14px';
    radiusInput.style.marginLeft = '6px';
    radiusInput.title = '線條粗細 / 點大小';
    
    const handleRadiusChange = () => {
        let value = parseFloat(radiusInput.value);
        if (isNaN(value) || value < 0.5) value = 1;
        else if (value > 20) value = 20;
        radiusInput.value = value;
        datasetMap.get(fileName).pointRadius = value;
        if (datasetMap.size > 0) drawChart();
    };
    radiusInput.addEventListener('blur', handleRadiusChange);
    radiusInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRadiusChange(); });
    entry.appendChild(radiusInput);

    // 更新顏色邏輯
    const updateColor = (hex, opacity = 1) => {
        datasetMap.get(fileName).color = hex;
        datasetMap.get(fileName).opacity = opacity;
        colorPreview.style.backgroundColor = hex;
        colorPreview.style.opacity = opacity;

        const hexInput = modal.querySelector(`#${modalId}-hexrgb .hex-input`);
        const rgbSliders = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-slider`);
        const rgbNumbers = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-number`);
        const rgbPreviewBoxes = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-preview-box`);
        const opacitySlider = modal.querySelector(`#${modalId}-hexrgb .opacity-slider`);
        const opacityNumber = modal.querySelector(`#${modalId}-hexrgb .opacity-number`);
        const livePreview = modal.querySelector(`#${modalId}-hexrgb .live-preview`);

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        hexInput.value = hex;
        rgbSliders[0].value = r;
        rgbSliders[1].value = g;
        rgbSliders[2].value = b;
        rgbNumbers[0].value = r;
        rgbNumbers[1].value = g;
        rgbNumbers[2].value = b;
        rgbPreviewBoxes[0].style.backgroundColor = `rgb(${r}, 0, 0)`;
        rgbPreviewBoxes[1].style.backgroundColor = `rgb(0, ${g}, 0)`;
        rgbPreviewBoxes[2].style.backgroundColor = `rgb(0, 0, ${b})`;
        opacitySlider.value = opacity;
        opacityNumber.value = Math.round(opacity * 100);
        livePreview.style.backgroundColor = hex;
        livePreview.style.opacity = opacity;

        const nativeColorInput = modal.querySelector(`#${modalId}-native .native-color-input`);
        nativeColorInput.value = hex;

        drawChart();
        modal.style.display = 'none';
    };

    const nativeColorInput = modal.querySelector(`#${modalId}-native .native-color-input`);
    const updateFromNativeInput = () => {
        const hex = nativeColorInput.value;
        const opacity = parseFloat(modal.querySelector(`#${modalId}-hexrgb .opacity-number`).value) / 100 || 1;
        updateColor(hex, opacity);
    };
    nativeColorInput.addEventListener('input', updateFromNativeInput);
    nativeColorInput.addEventListener('change', updateFromNativeInput);

    // 綁定 hex, rgb 這些的同步事件 (如原版)
    const confirmBtn = modal.querySelector(`#${modalId}-hexrgb .confirm-btn`);
    const opacityNumber = modal.querySelector(`#${modalId}-hexrgb .opacity-number`);
    const rgbNumbers = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-number`);
    
    confirmBtn.addEventListener('click', () => {
        const r = parseInt(rgbNumbers[0].value) || 0;
        const g = parseInt(rgbNumbers[1].value) || 0;
        const b = parseInt(rgbNumbers[2].value) || 0;
        const a = parseFloat(opacityNumber.value) / 100 || 0;
        if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 && a >= 0 && a <= 1) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            updateColor(hex, a);
        }
    });

    colorPreview.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.color-picker-modal').forEach(m => {
            if (m !== modal) m.style.display = 'none';
        });
        modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
        modal.style.left = `${e.pageX}px`;
        modal.style.top = `${e.pageY + 10}px`;
    });

    document.addEventListener('click', (e) => {
        if (!modal.contains(e.target) && e.target !== colorPreview) {
            modal.style.display = 'none';
        }
    }, { once: false });

    // 自定義名稱 Input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.style.width = '120px';
    nameInput.placeholder = '自訂名稱';
    nameInput.value = datasetMap.get(fileName).name;

    nameInput.addEventListener('blur', () => {
        datasetMap.get(fileName).name = nameInput.value.trim();
        drawChart();
    });
    nameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') nameInput.blur();
    });

    // 刪除按鈕
    const delBtn = document.createElement('button');
    delBtn.textContent = '刪除';
    delBtn.onclick = () => {
        datasetMap.delete(fileName);
        entry.remove();
        drawChart();
        updateFileCount();
    };

    // 建立隨機顏色按鈕
    const randomColorBtn = document.createElement('button');
    randomColorBtn.innerText = '🎲';
    randomColorBtn.className = 'random-color-btn';

    randomColorBtn.onclick = () => {
        const newColor = getRandomColor();
        const opacity = datasetMap.get(fileName).opacity || 1;
        updateColor(newColor, opacity); 
    };

    entry.appendChild(dragHandle);
    entry.appendChild(colorPreview);
    entry.appendChild(randomColorBtn);
    entry.appendChild(nameInput);
    entry.appendChild(document.createTextNode(' ' + datasetMap.get(fileName).simplifiedName + ' '));
    entry.appendChild(delBtn);
    container.appendChild(entry);
    document.getElementById('resetColorsBtn').style.display = datasetMap.size > 0 ? 'inline-block' : 'none';
}

// 生成隨機顏色並確保不與現有的重複
function getRandomColor() {
    const currentColors = Array.from(datasetMap.values()).map(info => info.color.toLowerCase());
    let newColor;
    let isDuplicate = true;
    
    while (isDuplicate) {
        // 生成隨機 Hex 顏色
        newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        if (!currentColors.includes(newColor)) {
            isDuplicate = false;
        }
    }
    return newColor;
}

function resetColors() {
    const entries = Array.from(datasetMap.entries());
    entries.forEach(([fileName, data], index) => {
        const newColor = defaultColors[index % defaultColors.length] || '#000000';
        data.color = newColor;
        data.pointRadius = 2; // 重置粗細
        
        const entryDiv = document.getElementById(`entry-${CSS.escape(fileName)}`);
        if (entryDiv) {
            const colorPreview = entryDiv.querySelector('.color-preview-box-list');
            if (colorPreview) colorPreview.style.backgroundColor = newColor;
            
            const radiusInput = entryDiv.querySelector('.point-radius-input');
            if (radiusInput) radiusInput.value = 2;
            
            // 同步更新 Modal 內的顏色
            const modal = entryDiv.querySelector('.color-picker-modal');
            if (modal) {
                const nativeColorInput = modal.querySelector('.native-color-input');
                if(nativeColorInput) nativeColorInput.value = newColor;
            }
        }
    });
    if (datasetMap.size > 0) drawChart();
}

function calculateMetrics() {
    const tbody = document.querySelector('#metrics-table tbody');
    tbody.innerHTML = '';
    
    if (datasetMap.size === 0) {
        document.getElementById('metrics-container').style.display = 'none';
        return;
    }

    // 1. 建立一個陣列來暫存所有計算結果，以便後續比較
    let metricsData = [];

    datasetMap.forEach((info, fileName) => {
        const data = info.data;
        const days = data.length;
        if (days < 2) return; 
        
        const FS = data.map(pt => pt.y);
        
        let peakVal = FS[0], peakDay = 1;
        let valleyVal = FS[0], valleyDay = 1;
        let max_dd_pct = 0, max_dd_val = 0;
        let currentPeak = FS[0], currentPeakDay = 1;

        for (let i = 0; i < days; i++) {
            if (FS[i] > currentPeak) {
                currentPeak = FS[i];
                currentPeakDay = i + 1;
            }
            let dd_val = FS[i] - currentPeak;
            let dd_pct = dd_val / currentPeak;
            if (dd_pct < max_dd_pct) {
                max_dd_pct = dd_pct;
                max_dd_val = dd_val;
                peakVal = currentPeak;
                peakDay = currentPeakDay;
                valleyVal = FS[i];
                valleyDay = i + 1;
            }
        }
        let mddPercent = max_dd_pct * -100; // 轉正數供網頁表格顯示

        // --- 2. 計算 Emotional Index (EI) & Flu ---
        let init_fund = FS[0];
        let final_FS = FS[days - 1];
        let emo_profit = (final_FS - init_fund) / (days - 1);
        let emo_fluctuation = 0;
        
        for (let i = 0; i < days; i++) {
            let FL_i = emo_profit * i + init_fund;
            emo_fluctuation += Math.pow(FL_i - FS[i], 2);
        }
        let flu = Math.sqrt(emo_fluctuation / days);
        let emotional_index = (flu !== 0) ? emo_profit / flu : 0;

        // --- 3. 計算 Trend Ratio (TR) ---
        let matrix_transpose_ddays = [[], []];
        let matrix_xtx_product = [[0, 0], [0, 0]];
        let ddays_final_matrix = [[], []];
        let high_trend_line = [0, 0];
        let daily_slope = [];
        let Y = [];

        for (let i = 0; i < days; i++) {
            let x = i + 1;
            matrix_transpose_ddays[0][i] = x * x;
            matrix_transpose_ddays[1][i] = x;
        }

        for (let i = 0; i < days; i++) {
            matrix_xtx_product[0][0] += matrix_transpose_ddays[0][i] * matrix_transpose_ddays[0][i];
            matrix_xtx_product[0][1] += matrix_transpose_ddays[0][i] * matrix_transpose_ddays[1][i];
            matrix_xtx_product[1][0] += matrix_transpose_ddays[1][i] * matrix_transpose_ddays[0][i];
            matrix_xtx_product[1][1] += matrix_transpose_ddays[1][i] * matrix_transpose_ddays[1][i];
        }

        let det = matrix_xtx_product[0][0] * matrix_xtx_product[1][1] - matrix_xtx_product[0][1] * matrix_xtx_product[1][0];
        let inv_xtx = [
            [matrix_xtx_product[1][1] / det, -matrix_xtx_product[0][1] / det],
            [-matrix_xtx_product[1][0] / det, matrix_xtx_product[0][0] / det]
        ];

        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < days; j++) {
                ddays_final_matrix[i][j] = inv_xtx[i][0] * matrix_transpose_ddays[0][j] + inv_xtx[i][1] * matrix_transpose_ddays[1][j];
            }
        }

        for (let i = 0; i < 2; i++) {
            high_trend_line[i] = 0;
            for (let j = 0; j < days; j++) {
                high_trend_line[i] += ddays_final_matrix[i][j] * (FS[j] - init_fund);
            }
        }

        let numerator = 0, denominator = 0, risk = 0;
        for (let i = 0; i < days; i++) {
            daily_slope[i] = 2 * high_trend_line[0] * (i + 1) + high_trend_line[1];
        }

        for (let i = 0; i < days; i++) {
            numerator += (i + 1) * daily_slope[i];
            denominator += (i + 1);
        }
        let exp_return = numerator / denominator;

        for (let i = 0; i < days; i++) {
            let x = i + 1;
            Y[i] = high_trend_line[0] * x * x + high_trend_line[1] * x + init_fund;
            risk += Math.pow(FS[i] - Y[i], 2);
        }
        risk = Math.sqrt(risk / days);

        let trend_ratio = 0;
        if (exp_return === 0) trend_ratio = 0;
        else if (exp_return < 0) trend_ratio = exp_return * risk;
        else trend_ratio = exp_return / risk;

        // ==== 把 CSV 會用到的所有詳細變數都存進 info.metrics ====
        info.metrics = {
            days: days,
            init_fund: init_fund,
            final_FS: final_FS,
            emo_profit: emo_profit,
            flu: flu,
            emotional_index: emotional_index,
            high_trend_line: high_trend_line,
            risk: risk,
            exp_return: exp_return,
            trend_ratio: trend_ratio,
            peakVal: peakVal,
            peakDay: peakDay,
            valleyVal: valleyVal,
            valleyDay: valleyDay,
            max_dd_val: max_dd_val,
            mddPercent: mddPercent
        };

        // 把結果存入陣列中
        metricsData.push({
            info: info,
            trend_ratio: trend_ratio,
            emotional_index: emotional_index,
            flu: flu,
            mddPercent: mddPercent,
            final_FS: final_FS
        });
    });

    // 2. 判斷是否有 2 個檔案以上，並找出每個指標的「最佳值」
    let isCompare = metricsData.length >= 2;
    let bestTR = -Infinity, bestEI = -Infinity, bestFlu = Infinity, bestMDD = Infinity, bestFinalFS = -Infinity;

    if (isCompare) {
        metricsData.forEach(d => {
            if (d.trend_ratio > bestTR) bestTR = d.trend_ratio;             // TR: 越高越好
            if (d.emotional_index > bestEI) bestEI = d.emotional_index;     // EI: 越高越好
            if (d.flu < bestFlu) bestFlu = d.flu;                           // Flu: 越低越穩
            if (d.mddPercent < bestMDD) bestMDD = d.mddPercent;             // MDD: 越低越好
            if (d.final_FS > bestFinalFS) bestFinalFS = d.final_FS;         // Final FS: 越高越好
        });
    }

    // 3. 渲染表格，並動態判斷是否要標紅字
    metricsData.forEach(d => {
        let trDisplay = d.trend_ratio < 0 ? d.trend_ratio.toExponential(2).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2') : d.trend_ratio.toFixed(6);

        // 判斷樣式的輔助函式
        const getStyle = (val, bestVal) => (isCompare && val === bestVal) ? 'color: red; font-weight: bold;' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: ${d.info.color}; font-weight: bold;">${d.info.name}</td>
            <td style="${getStyle(d.trend_ratio, bestTR)}">${trDisplay}</td>
            <td style="${getStyle(d.emotional_index, bestEI)}">${d.emotional_index.toFixed(6)}</td>
            <td style="${getStyle(d.flu, bestFlu)}">${d.flu.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
            <td style="${getStyle(d.mddPercent, bestMDD)}">${d.mddPercent.toFixed(2)}%</td>
            <td style="${getStyle(d.final_FS, bestFinalFS)}">${d.final_FS.toLocaleString(undefined, {maximumFractionDigits: 0})}</td> 
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('metrics-container').style.display = 'block';
}

// ==========================================
//  繪製資金折線圖 (取代原先的 Pareto 前緣)
// ==========================================
function drawChart() {
    if (datasetMap.size === 0) {
        if (chartInstance) chartInstance.destroy();
        document.getElementById('chart-container').style.display = 'none';
        document.getElementById('resetColorsBtn').style.display = 'none';
        document.getElementById('downloadAllBtn').style.display = 'none';
        document.getElementById('metrics-container').style.display = 'none';
        return;
    }
    const ctx = document.getElementById('fundsChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const datasets = Array.from(datasetMap.entries()).map(([fileName, info]) => {
        // 將透明度整合進顏色中（或者用 Chart.js 的 backgroundColor rgba，這裡簡單保留原色）
        return {
            label: info.name || fileName,
            data: info.data,
            backgroundColor: info.color,
            borderColor: info.color,
            borderWidth: info.pointRadius || 2,         // 讓「粗細設定」連動線條寬度
            //pointRadius: info.pointRadius <= 1 ? 0 : info.pointRadius - 1, // 點稍微小一點
            pointRadius: 0,
            hoverRadius: info.pointRadius + 2,
            showLine: true, // 開啟連線
            fill: false,
            tension: 0.1 // 0 為直線，想平滑可設為 0.2
        };
    });

    const minX = parseFloat(minDayInput.value);
    const maxX = parseFloat(maxDayInput.value);
    const minY = parseFloat(minFSInput.value);
    const maxY = parseFloat(maxFSInput.value);

    chartInstance = new Chart(ctx, {
        type: 'scatter', // 配合 showLine 完美繪製 X/Y 序列折線圖
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Comparison of Fund Standardization Across Strategies',
                    font: { family: 'Times New Roman', size: 32, weight: 'bold' },
                    color: '#000'
                },
                tooltip: {
                    titleFont: { family: 'Times New Roman', size: 16 },
                    bodyFont: { family: 'Times New Roman', size: 16 },
                    callbacks: {
                        title: function(context) {
                            return `Days: ${context[0].parsed.x}`;
                        },
                        label: function (context) {
                            const yVal = context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                            return `${context.dataset.label}: ${yVal}`;
                        }
                    }
                },
                legend: {
                    labels: {
                        font: { family: 'Times New Roman', size: 16, weight: 'bold' },
                        color: '#000'
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Days',
                        font: { family: 'Times New Roman', size: 24, weight: 'bold' },
                        color: '#000'
                    },
                    ticks: { font: { family: 'Times New Roman', size: 18, weight: 'bold' }, color: '#000' },
                    min: isNaN(minX) ? undefined : minX,
                    max: isNaN(maxX) ? undefined : maxX
                },
                y: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Fund Standardization',
                        font: { family: 'Times New Roman', size: 24, weight: 'bold' },
                        color: '#000'
                    },
                    ticks: { 
                        font: { family: 'Times New Roman', size: 18, weight: 'bold' }, 
                        color: '#000',
                        callback: function(value) {
                            return value.toLocaleString(); // 加入千分位逗號
                        }
                    },
                    min: isNaN(minY) ? undefined : minY,
                    max: isNaN(maxY) ? undefined : maxY
                }
            }
        }
    });

    document.getElementById('chart-container').style.display = 'block';
    document.getElementById('chart-container').addEventListener('dblclick', function () {
        if(chartInstance) chartInstance.resetZoom();
    });

    // 同時控制「重置所有顏色」和「下載全部指標」按鈕的顯示狀態
    let showButtons = datasetMap.size > 0 ? 'inline-block' : 'none';
    document.getElementById('resetColorsBtn').style.display = showButtons;
    document.getElementById('downloadAllBtn').style.display = showButtons;

    calculateMetrics();
}