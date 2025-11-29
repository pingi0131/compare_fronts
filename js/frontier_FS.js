let chartInstance = null;
const datasetMap = new Map();
const defaultColors = ['#0000FF', '#FFA500', '#888888', '#00AA00'];
let initialRanges = {
    minRisk: undefined,
    maxRisk: undefined,
    minProfit: undefined,
    maxProfit: undefined
};
const priorityFolders = ['MoQTS', 'MoQA', 'with ELS', 'Our method', 'MoQIO', 'Hybrid', 'H-MoQTS'];     // 設定優先排序的名稱，包括matrix和前緣顏色
let modalCounter = 0;

const MARKET_GROUPS = {     // 設定演算法的投資市場
    DJIA:          ['WPM_MoQTS', 'WPM_Hybrid', 'WPM_MoQA'],
    NIKKEI:        [],
    NIKKEI_DJIA:   ['EPM_H-MoQTS'],
    DJIA_NIKKEI:   []
};

// 建立 hash table，加速搜尋 O(1)
const MARKET_MAP = Object.entries(MARKET_GROUPS).reduce((map, [market, algos]) => {
    algos.forEach(algo => {
        map[algo] = market;
    });
    return map;
}, {});

const periodRanges = {
    WPM_Hybird:  { M2M: {minY:2021,minM:12, maxY:2025,maxM:4}},
    WPM_MoQTS:   { M2M: {minY:2021,minM:12, maxY:2024,maxM:11}},
    WPM_MoQA:    { M2M: {minY:2021,minM:12, maxY:2025,maxM:4}},
    "EPM_H-MoQTS": { 
        M2M: {minY:2023,minM:1, maxY:2025,maxM:4}, 
        Q2Q: {minY:2020,minQ:1, maxY:2024,maxQ:3},
        H2H: {minY:2020,minH:1, maxY:2024,maxH:1},
        Y2Y: {minY:2020,        maxY:2024}
    }
};

const csvPortfolioPathMap = {
    WPM_MoQTS: {
        M2M: (year, period) => {
            const paddedMonth = period.toString().padStart(2, '0');
            return [`MoQTS/MoQTS/M2M/train_${year}_${paddedMonth}%28${year}%20Q1%29_50_front.csv`];
        },
    },
    WPM_Hybird: {
        M2M: (year, period) => {
            const paddedMonth = period.toString().padStart(2, '0');
            return [`WPM-Hybrid/Hybrid/M2M/train_${year}_${paddedMonth}%28${year}%20Q1%29.csv`];
        },
    },
    WPM_MoQA: {
        M2M: (year, period) => {
            const paddedMonth = period.toString().padStart(2, '0');
            return [`WPM-MoQA/MoQA/M2M/before_${year}_${paddedMonth}%28${year}%20Q1%29.csv`];
        },
    },
    'EPM_H-MoQTS': {
        M2M: (year, period) => {
            const paddedMonth = period.toString().padStart(2, '0');
            return [`H-MoQTS/H-MoQTS/M2M/UA_NIKKEI30%26DJIA30_${year}_${paddedMonth}%28${year}%20Q1%29_60%23_front.csv`];
        },
        Q2Q: (year, quarterLabel) => {
            quarterLabel = quarterLabel.replace('Q', '');
            return [`H-MoQTS/H-MoQTS/Q2Q/UA_NIKKEI30%26DJIA30_${year}_Q${quarterLabel}%28${year}%20Q1%29_60%23_front.csv`];
        },
        H2H: (year, halfYearLabel) => {
            halfYearLabel = Number(halfYearLabel.replace('H', ''));
            halfYearLabel = halfYearLabel*2-1;
            return [`H-MoQTS/H-MoQTS/H2H/UA_NIKKEI30%26DJIA30_${year}_Q${halfYearLabel}-Q${halfYearLabel+1}%28${year}%20Q1%29_60%23_front.csv`];
        },
        Y2Y: (year) => {
            return [`H-MoQTS/H-MoQTS/Y2Y/UA_NIKKEI30%26DJIA30_${year}%28${year}%20Q1%29_60%23_front.csv`];
        }
    }
};

function formatNum(num, fixed_length = 2) {
    const str = num.toFixed(fixed_length);
    const [integerPart, decimalPart] = str.split('.');

    // 整數部分：每三位加逗號
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // 小數部分：原樣保留，不加逗號
    return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

function filterDataByRange(dataMap, minRisk, maxRisk, minProfit, maxProfit) {
    const filteredMap = new Map();
    dataMap.forEach((value, fileName) => {
        const filteredData = value.data.filter(point => {
            const x = point.x;
            const y = point.y;
            return (
                (isNaN(minRisk) || x >= minRisk) &&
                (isNaN(maxRisk) || x <= maxRisk) &&
                (isNaN(minProfit) || y >= minProfit) &&
                (isNaN(maxProfit) || y <= maxProfit)
            );
        });
        if (filteredData.length > 0) {
            filteredMap.set(fileName, {
                ...value,
                data: filteredData
            });
        }
    });
    return filteredMap;
}

// Generate date list
function generateDateList() {
    const key = document.getElementById('dataSourceSelect').value;
    const range = periodRanges[key];
    if (!range) return [];  // 沒有設定這個 演算法 時回傳 []

    let r;
    if (currentPeriod === 'M2M') r = range.M2M;
    else if (currentPeriod === 'Q2Q') r = range.Q2Q;
    else if (currentPeriod === 'H2H') r = range.H2H;
    else if (currentPeriod === 'Y2Y') r = range.Y2Y;
    else r = null;

    if (!r) return [];      // 沒有設定這個 period 時回傳 []

    const dates = [];
    if (currentPeriod === 'M2M') {
        // M2M → YYYY_MM 格式
        for (let y = r.maxY; y >= r.minY; y--) {
            const maxM = (y === r.maxY) ? r.maxM : 12;
            const minM = (y === r.minY) ? r.minM : 1;
            for (let m = maxM; m >= minM; m--) {
                dates.push(`${y}_${String(m).padStart(2,'0')}`);
            }
        }
    } else if(currentPeriod === 'Q2Q') {
        for (let y = r.maxY; y >= r.minY; y--) {
            const maxQ = (y === r.maxY) ? r.maxQ : 4;
            const minQ = (y === r.minY) ? r.minQ : 1;
            for (let q = maxQ; q >= minQ; q--) {
                dates.push(`${y}_Q${q}`);   // 2025_Q1
            }
        }
    } else if(currentPeriod === 'H2H') {
        for (let y = r.maxY; y >= r.minY; y--) {
            const maxH = (y === r.maxY) ? r.maxH : 2;
            const minH = (y === r.minY) ? r.minH : 1;
            for (let h = maxH; h >= minH; h--) {
                dates.push(`${y}_H${h}`);   // 2025_H1
            }
        }
    } else if(currentPeriod === 'Y2Y') {
        for (let y = r.maxY; y >= r.minY; y--) {
            dates.push(`${y}`);   // 2025
        }
    }
    return dates;
}

// Populate sidebar with date entries
function populateDateSidebar() {
    const sidebar = document.getElementById('dateSidebar');
    sidebar.innerHTML = '';
    document.getElementById('yearInput').value = '';
    document.getElementById('periodInput').value = '';
    document.getElementById('chart-wrapper').style.display = 'none';
    document.getElementById('chart-container').style.display = 'none';
    document.getElementById('fileListContainer').innerHTML = '';
    hideDetailPanel();
    const dates = generateDateList();
    //console.log(dates)

    if (dates.length === 0) {   // ── 沒有資料時顯示「No Data」──
        const noDataDiv = document.createElement('div');
        noDataDiv.className = 'date-entry';
        noDataDiv.textContent = 'No Data';
        noDataDiv.style.cssText = `
            background-color: #f5f5f5 !important;
            color: #000 !important;
            cursor: not-allowed !important;
            opacity: 1;
            pointer-events: none;   /* 完全不能點 */
            font-style: italic;
            /* font-family: 'Times New Roman', Times, serif; */
            font-size: 26px;
            /* border: 1px dashed #ccc; */
        `;
        noDataDiv.title = '此演算法在此區間無資料';
        sidebar.appendChild(noDataDiv);
        return; // 直接結束
    }

    dates.forEach(date => {
        const div = document.createElement('div');
        div.className = 'date-entry';
        div.textContent = date;

        const [year, rest] = date.split('_');
        // 在建立時就寫死 dataset，避免undefined
        div.dataset.key = date;  // 例如：2025_04 或 2025_Q1
        div.dataset.year = year;
        div.dataset.period = rest;

        div.addEventListener('click', () => {
            document.querySelectorAll('.date-entry').forEach(e => e.classList.remove('selected'));
            div.classList.add('selected');

            // 填入輸入框
            document.getElementById('yearInput').value = year;
            const periodInput = document.getElementById('periodInput');
            if (currentPeriod === 'M2M') {
                periodInput.value = parseInt(rest);
            } else if(currentPeriod === 'Q2Q') {
                const quarterNum = rest.replace('Q', '');  // "Q1" → "1"
                periodInput.value = quarterNum;
            } else if(currentPeriod === 'H2H') {
                const halfYearNum = rest.replace('H', '');  // "H1" → "1"
                periodInput.value = halfYearNum;
            } else if(currentPeriod === 'Y2Y') {
                periodInput.value = '';
            }

            loadFilesFromDataDir(year, rest); // rest 可能是 04 或 Q1
        });
        sidebar.appendChild(div);
    });
}

function initializeSidebarHover() {
    const sidebar = document.getElementById('dateSidebar');
    const trigger = document.getElementById('sidebarTrigger');

    trigger.addEventListener('mouseenter', () => {
        sidebar.classList.add('visible');
    });

    sidebar.addEventListener('mouseenter', () => {
        sidebar.classList.add('visible');
    });

    sidebar.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || (e.relatedTarget !== trigger && !trigger.contains(e.relatedTarget))) {
            sidebar.classList.remove('visible');
        }
    });

    trigger.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || (e.relatedTarget !== sidebar && !sidebar.contains(e.relatedTarget))) {
            sidebar.classList.remove('visible');
        }
    });
}

function initializeDataSourceSelect() {
    const dataSourceSelect = document.getElementById('dataSourceSelect');
    dataSourceSelect.addEventListener('change', () => {
        // 刷新側邊欄的日期列表
        populateDateSidebar();
        hideDetailPanel();

        // 清空圖表和相關 UI 元素
        datasetMap.clear();
        document.getElementById('fileListContainer').innerHTML = '';
        document.getElementById('chart-wrapper').style.display = 'none';
        document.getElementById('yearInput').value = '';
        document.getElementById('periodInput').value = '';

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const range = getCurrentRange();

        // 更新輸入框的限制條件
        const yearInput = document.getElementById('yearInput');
        const periodInput = document.getElementById('periodInput');

        // 重置輸入框為空或預設值
        yearInput.value = '';
        periodInput.value = '';

        // 更新年份和月份的限制
        yearInput.min = range.minY;
        yearInput.max = range.maxY;

        const year = parseInt(yearInput.value) || range.maxY;
        const isMinYear = year === range.minY;
        const isMaxYear = year === range.maxY;

        const minP = isMinYear ? (range.minM ?? range.minQ ?? 1) : 1;
        const maxP = isMaxYear ? (range.maxM ?? range.maxQ ?? 12) : (currentPeriod === 'Q2Q' ? 4 : 12);

        periodInput.min = minP;
        periodInput.max = maxP;

        // 清空側邊欄的選中狀態
        const sidebar = document.getElementById('dateSidebar');
        sidebar.querySelectorAll('.date-entry').forEach(entry => {
            entry.classList.remove('selected');
        });
    });
}

// Call populateDateSidebar when the page loads
document.addEventListener('DOMContentLoaded', () => {
    populateDateSidebar();
    initializeSidebarHover();
    initializeDateInputs();
    initializeDataSourceSelect();
});

// 初始化輸入框事件監聽器
function initializeDateInputs() {
    const yearInput = document.getElementById('yearInput');
    const periodInput = document.getElementById('periodInput');
    const loadDateBtn = document.getElementById('loadDateBtn');
    const dataSourceSelect = document.getElementById('dataSourceSelect');

    function updateInputConstraints() {
        const range = getCurrentRange();
        if (!range.minY) return;

        yearInput.min = range.minY;
        yearInput.max = range.maxY;

        const year = parseInt(yearInput.value) || range.maxY;
        const isMinYear = year === range.minY;
        const isMaxYear = year === range.maxY;

        const minP = isMinYear ? (range.minM ?? range.minQ ?? 1) : 1;
        const maxP = isMaxYear ? (range.maxM ?? range.maxQ ?? 12) : (currentPeriod === 'Q2Q' ? 4 : 12);

        periodInput.min = minP;
        periodInput.max = maxP;

        // 自動修正超出範圍的輸入
        if (periodInput.value && parseInt(periodInput.value) < minP) periodInput.value = minP;
        if (periodInput.value && parseInt(periodInput.value) > maxP) periodInput.value = maxP;
    }

    // Initialize constraints on page load
    updateInputConstraints();

    // Update constraints when dataset or year changes
    dataSourceSelect.addEventListener('change', updateInputConstraints);
    yearInput.addEventListener('input', updateInputConstraints);

    // 點擊「載入」按鈕時觸發
    loadDateBtn.addEventListener('click', () => {
        fillDefaultIfEmpty();

        let year   = yearInput.value.trim();
        let period = periodInput.value.trim();

        // 月比較（M2M）才需要補零
        if (currentPeriod === 'M2M') period = period.padStart(2, '0');

        if (validateDate(year, period)) {
            loadFilesFromDataDir(year, period);
            updateSidebarSelection(year, period);
        } else {
            showRangeAlert();
        }
    });

    // 輸入框按 Enter
    [yearInput, periodInput].forEach(input => {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                loadDateBtn.click();  // 直接觸發載入按鈕
            }
        });
    });
}

// 共用：取得目前資料來源的期間範圍物件
function getCurrentRange() {
    const key = dataSourceSelect.value;
    const ranges = periodRanges[key] || {};
    
    if (currentPeriod === 'M2M') return ranges.M2M || {};
    if (currentPeriod === 'Q2Q') return ranges.Q2Q || {};
    if (currentPeriod === 'H2H') return ranges.H2H || {};
    if (currentPeriod === 'Y2Y') return ranges.Y2Y || {};
    return {};
}

// 共用：把範圍資訊寫回 input（只在「空白」時填入最大值）
function fillDefaultIfEmpty() {
    if (yearInput.value.trim()) return;                     // 已經有年份就不動

    const range = getCurrentRange();
    if (!range.maxY) return;

    yearInput.value = range.maxY;

    let maxPeriod = range.maxM ?? range.maxQ ?? range.maxH ?? '';
    periodInput.value = parseInt(maxPeriod) || '';
}

// 共用：驗證日期是否在允許範圍內
function validateDate(year, period) {
    const range = getCurrentRange();
    if (!range.minY) return false;

    const y = parseInt(year);
    const p = parseInt(period);

    if (y < range.minY || y > range.maxY) return false;

    const minP = range.minM ?? range.minQ ?? range.minH ?? 1;
    const maxP = range.maxM ?? range.maxQ ?? range.maxH ?? 12;

    if (y === range.minY && p < minP) return false;
    if (y === range.maxY && p > maxP) return false;

    return true;
}

// 共用：載入失敗時顯示範圍提示
function showRangeAlert() {
    const range = getCurrentRange();
    if (!range.minY) return;

    const minY = range.minY;
    const maxY = range.maxY;
    const minP = (range.minM ?? range.minQ ?? range.minH ?? 1).toString().padStart(2, '0');
    const maxP = (range.maxM ?? range.maxQ ?? range.maxH ?? 12).toString().padStart(2, '0');

    alert(`區間範圍：${minY}/${minP} ~ ${maxY}/${maxP}`);
}

// 更新側邊欄選中狀態
function updateSidebarSelection(year, period) {
    document.querySelectorAll('.date-entry').forEach(entry => {
        entry.classList.remove('selected');
        let targetPeriod;
        if (currentPeriod === 'M2M') {
            targetPeriod = String(period).padStart(2, '0');  // 4 → "04"
        } else {
            targetPeriod = 'Q' + String(period);  // "2" → "Q2"
        }
        if (entry.dataset.year === String(year) && 
            entry.dataset.period === targetPeriod) {
            entry.classList.add('selected');
        }
    });
}

let currentPeriod = 'M2M';  // 預設值

// 初始化水平區間選擇器
document.addEventListener('DOMContentLoaded', () => {
    const dataSourceSelect = document.getElementById('dataSourceSelect');
    const periodEntries = document.querySelectorAll('#periodSidebar .period-entry');

    dataSourceSelect.addEventListener('change', populateDateSidebar);

    periodEntries.forEach(entry => {
        entry.addEventListener('click', function() {
            periodEntries.forEach(e => e.classList.remove('selected'));
            this.classList.add('selected');
            currentPeriod = this.dataset.period; // M2M / Q2Q / H2H / Y2Y
            populateDateSidebar();
            document.getElementById('chart-container').style.display = 'none';
            document.getElementById('yearInput').value = '';
            document.getElementById('periodInput').value = '';
            hideDetailPanel();
        });
    });
    // 支援滑鼠滾輪水平滾動（很多使用者習慣垂直滾輪）
    periodSidebar.addEventListener('wheel', function(e) {
        if (e.deltaY !== 0) {
            e.preventDefault();
            this.scrollLeft += e.deltaY * 0.7;  // 垂直滾輪變成水平滾動
        }
    }, { passive: false });
});

function parsePortfolioString(str, count) {
    if (!str) return [];

    const result = [];
    const trimmed = str.trim();

    // 支援 {xx%} 或 (xx%)
    const bracketRegex = /(\w+(?:\.\w+)?)[\(\{](\d+(?:\.\d+)?)%[\)\}]/g;
    let match;

    // 先嘗試解析所有有括號的比例格式
    const bracketMatches = [];
    while ((match = bracketRegex.exec(trimmed)) !== null) {
        bracketMatches.push({
            name: match[1].trim(),
            rawPercent: match[2]  // 原始數字字串
        });
    }

    // 若有任何括號格式 → 依「整數 / 小數」處理
    if (bracketMatches.length > 0) {
        bracketMatches.forEach(item => {
            const raw = item.rawPercent;
            const num = parseFloat(raw);
            if (isNaN(num)) return;

            let display;
            if (raw.includes('.')) {    // 小數比例 → 四捨五入 2 位
                display = num.toFixed(2).replace(/\.?0+$/, '') + '%';
            } else {                    // 整數比例 → 原樣顯示
                display = raw + '%';
            }

            result.push({
                name: item.name,
                percent: num,
                display: display
            });
        });
        return result;
    }

    // 無任何括號比例 → 平均分配（保留 2 位小數）
    const stocks = trimmed
        .split(/\s+/)
        .map(s => s.replace(/,/g, '').trim())
        .filter(s => s.length > 0);

    if (stocks.length === 0) return [];

    const avg = 100.0 / stocks.length;
    const avgDisplay = avg.toFixed(2).replace(/\.?0+$/, '') + '%';

    stocks.forEach(stock => {
        result.push({
            name: stock,
            percent: avg,
            display: avgDisplay
        });
    });

    return result;
}

// Modified loadFilesFromDataDir to accept year and month parameters
async function loadFilesFromDataDir(year, period) {
    hideDetailPanel();
    document.getElementById('chart-wrapper').style.display = 'none';
    document.getElementById('fileListContainer').innerHTML = '';
    if (!year || (currentPeriod !== 'Y2Y' && !period)) {        // 是Y2Y就不用有period
        alert('請選擇一個日期');
        return;
    }
    const dataSource = document.getElementById('dataSourceSelect').value;
    let paddedMonth = period;
    if (currentPeriod === 'M2M') paddedMonth = period.padStart(2, '0');
    // 關鍵：使用 currentPeriod 來決定資料夾
    const periodFolder = currentPeriod;   // M2M / Q2Q / H2H / Y2Y
    let csvFiles = [];

    // 依資料來源決定要載入的檔案
    const generator = csvPortfolioPathMap[dataSource]?.[currentPeriod];

    if (generator) {
        csvFiles = generator(year, period); // month 可以在 Q2Q 不需要時忽略
    } else {
        alert('只顯示我們的方法 WPM_MoQTS, WPM_Hybird, WPM_MoQA');
        return;
    }
    //console.log(csvFiles)

    try {
        datasetMap.clear();
        document.getElementById('fileListContainer').innerHTML = '';
        document.getElementById('stockPriceContainer').style.display = 'none';
        document.getElementById('stockPriceError').style.display = 'none';

        for (const filePath of csvFiles) {
            try {
                const fileResponse = await fetch(`https://pingi0131.github.io/compare_fronts/data/${filePath}`);
                if (!fileResponse.ok) continue;

                const text = await fileResponse.text();
                const lines = text.split(/\r?\n/);
                if (lines.length === 0) continue;

                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

                // 必要欄位索引
                const riskIndex = headers.findIndex(h => h.includes('risk'));
                const profitIndex = headers.findIndex(h => h.includes('profit') || h.includes('return'));
                const portfolioIndex = headers.findIndex(h => h.includes('portfolio{%}') || h=== 'portfolio');
                const countIndex = headers.findIndex(h => h.includes('# of portfolio'));
                //alert(`${portfolioIndex}`);

                if (riskIndex === -1 || profitIndex === -1) continue;

                const parsed = [];
                const portfolioInfo = [];   // 每點的投資組合資訊
                const parsedSet = new Set();

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const cols = line.split(',').map(c => c.trim());

                    const x = parseFloat(cols[riskIndex]);
                    const y = parseFloat(cols[profitIndex]);
                    const key = `${x},${y}`;

                    if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0 || parsedSet.has(key)) continue;

                    parsedSet.add(key);
                    parsed.push({ x, y });

                    // 解析投資組合
                    const count = countIndex !== -1 ? parseInt(cols[countIndex]) || 0 : 0;
                    const portfolioStr = portfolioIndex !== -1 ? cols[portfolioIndex] : '';
                    const stocks = parsePortfolioString(portfolioStr, count);

                    portfolioInfo.push({ count, stocks });
                }

                if (parsed.length > 0) {
                    const fileName = filePath.split('/').pop();
                    const folder = filePath.split('/')[1];
                    //const displayFolder = folder.includes('MoQTS') ? 'MoQTS' :
                    //                    folder.includes('Hybrid') ? 'Hybrid' : 'MoQA';
                    const displayFolder = folder;
                    const color = '#FF0000';
                    const simplifiedFileName = `${displayFolder}_${year}_${paddedMonth}_front.csv`;
                    // 計算每個點的 TR = y / x (return/risk)
                    const TrendRatio = parsed.map(p => p.y / p.x);
                    const maxTR = Math.max(...TrendRatio);
                    const maxTRIdx = TrendRatio.indexOf(maxTR);   // ← 最高 TR 的 index

                    datasetMap.set(fileName, {
                        name: displayFolder,
                        data: parsed.sort((a, b) => a.x - b.x),
                        portfolioInfo,           // 關鍵：儲存每點的組合資訊
                        maxTRIndex: maxTRIdx,        // 最高 TR 的 index
                        color,
                        simplifiedName: simplifiedFileName,
                        pointRadius: 3
                    });

                    //alert(`maxTR: ${maxTR}\n maxTR index: ${datasetMap.get(fileName).maxTRIndex}\nmaxTR index: ${maxTRIdx}`)

                    addFileEntryUI(fileName, color);
                }
            } catch (err) {
                console.error(`處理 ${filePath} 失敗`, err);
            }
        }

        if (datasetMap.size > 0) {
            drawChart();
        } else {
            alert(`沒有成功載入任何有效 CSV 檔案`);
        }
    } catch (error) {
        console.error('載入失敗:', error);
        alert(`載入失敗: ${error.message}`);
    }
}

const minRiskInput = document.getElementById('minRisk');
const maxRiskInput = document.getElementById('maxRisk');
const minProfitInput = document.getElementById('minProfit');
const maxProfitInput = document.getElementById('maxProfit');
const defaultRanges = {
    minRisk: undefined,
    maxRisk: undefined,
    minProfit: undefined,
    maxProfit: undefined,
    pointRadiusInput: 2 // Default point radius
};
[minRiskInput, maxRiskInput, minProfitInput, maxProfitInput].forEach(input => {
    input.addEventListener('blur', () => {
        if (datasetMap.size > 0) {
            drawChart();
        }
    });
    input.addEventListener('keypress', e => {
        if (e.key === 'Enter' && datasetMap.size > 0) {
            drawChart();
        }
    });
});

function resetField(fieldId) {
    document.getElementById(fieldId).value = defaultRanges[fieldId] ?? '';
    if (datasetMap.size > 0) {
        drawChart();
    }
}

function resetAllRanges() {
    for (const key in initialRanges) {
        document.getElementById(key).value = initialRanges[key] !== undefined ? initialRanges[key].toFixed(2) : '';
    }
    if (datasetMap.size > 0) {
        drawChart();
    }
}

function addFileEntryUI(fileName, defaultColor) {
    const container = document.getElementById('fileListContainer');
    const entry = document.createElement('div');
    entry.className = 'file-entry';
    entry.id = `entry-${CSS.escape(fileName)}`;

    const colorPreview = document.createElement('div');
    colorPreview.className = 'color-preview-box-list';
    colorPreview.style.backgroundColor = defaultColor;
    colorPreview.style.opacity = datasetMap.get(fileName).opacity || 1;
    colorPreview.title = '點擊選擇顏色';

    const modalId = `color-picker-${modalCounter++}`;
    const modal = document.createElement('div');
    modal.className = 'color-picker-modal';
    modal.style.display = 'none';
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

    const tabs = modal.querySelectorAll('.color-picker-tabs button');
    const contents = modal.querySelectorAll('.color-picker-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const content = modal.querySelector(`#${modalId}-${tab.dataset.tab}`);
            if (content) {
                content.classList.add('active');
            } else {
                console.error(`Content element #${modalId}-${tab.dataset.tab} not found`);
            }
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

    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.className = 'point-radius-input';
    radiusInput.min = '1';
    radiusInput.max = '12';
    radiusInput.step = '1';
    radiusInput.value = datasetMap.get(fileName).pointRadius || 2;
    radiusInput.style.width = '26px'; // Reduced from 60px
    radiusInput.style.height = '20px'; // Explicitly set height to make it smaller
    radiusInput.style.fontSize = '14px'; // Smaller font for better fit
    radiusInput.style.marginLeft = '6px';
    radiusInput.title = '點大小';
    radiusInput.addEventListener('blur', () => {
        let value = parseFloat(radiusInput.value);
        if (isNaN(value) || value < 0.5) {
            value = 2;
            radiusInput.value = 2;
        } else if (value > 20) {
            value = 20;
            radiusInput.value = 20;
        }
        datasetMap.get(fileName).pointRadius = value;
        if (datasetMap.size > 0) {
            drawChart();
        }
    });
    radiusInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            let value = parseFloat(radiusInput.value);
            if (isNaN(value) || value < 0.5) {
                value = 2;
                radiusInput.value = 2;
            } else if (value > 20) {
                value = 20;
                radiusInput.value = 20;
            }
            datasetMap.get(fileName).pointRadius = value;
            if (datasetMap.size > 0) {
                drawChart();
            }
        }
    });
    entry.appendChild(radiusInput);

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

    const hexInput = modal.querySelector(`#${modalId}-hexrgb .hex-input`);
    const rgbSliders = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-slider`);
    const rgbNumbers = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-number`);
    const opacitySlider = modal.querySelector(`#${modalId}-hexrgb .opacity-slider`);
    const opacityNumber = modal.querySelector(`#${modalId}-hexrgb .opacity-number`);
    const confirmBtn = modal.querySelector(`#${modalId}-hexrgb .confirm-btn`);
    const livePreview = modal.querySelector(`#${modalId}-hexrgb .live-preview`);

    const updatePreview = () => {
        const r = parseInt(rgbNumbers[0].value) || 0;
        const g = parseInt(rgbNumbers[1].value) || 0;
        const b = parseInt(rgbNumbers[2].value) || 0;
        const a = parseFloat(opacityNumber.value) / 100 || 0; // Use 0 if invalid
        if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 && a >= 0 && a <= 1) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            livePreview.style.backgroundColor = hex;
            livePreview.style.opacity = a;
            hexInput.value = hex;
        }
    };

    const updateFromHex = () => {
        const value = hexInput.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            const r = parseInt(value.slice(1, 3), 16);
            const g = parseInt(value.slice(3, 5), 16);
            const b = parseInt(value.slice(5, 7), 16);
            const a = parseFloat(opacityNumber.value) / 100 || 0;
            rgbPreviewBoxes[0].style.backgroundColor = `rgb(${r}, 0, 0)`;
            rgbPreviewBoxes[1].style.backgroundColor = `rgb(0, ${g}, 0)`;
            rgbPreviewBoxes[2].style.backgroundColor = `rgb(0, 0, ${b})`;
            livePreview.style.backgroundColor = value;
            livePreview.style.opacity = a;
            updateColor(value, a);
        }
    };

    const updateFromRGB = () => {
        const r = parseInt(rgbNumbers[0].value) || 0;
        const g = parseInt(rgbNumbers[1].value) || 0;
        const b = parseInt(rgbNumbers[2].value) || 0;
        const a = parseFloat(opacityNumber.value) / 100 || 0;
        if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 && a >= 0 && a <= 1) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            rgbPreviewBoxes[0].style.backgroundColor = `rgb(${r}, 0, 0)`;
            rgbPreviewBoxes[1].style.backgroundColor = `rgb(0, ${g}, 0)`;
            rgbPreviewBoxes[2].style.backgroundColor = `rgb(0, 0, ${b})`;
            livePreview.style.backgroundColor = hex;
            livePreview.style.opacity = a;
            updateColor(hex, a);
        }
    };

    const syncSliderAndNumber = (slider, number, previewBox, channel) => {
        slider.addEventListener('input', () => {
            if (channel === 'opacity') {
                const value = parseFloat(slider.value) || 0;
                number.value = Math.round(value * 100); // Convert decimal to percentage
                updatePreview(); // Update live preview with opacity
            } else {
                number.value = slider.value;
                updatePreview();
                const value = parseInt(slider.value) || 0;
                if (channel === 'r') {
                    previewBox.style.backgroundColor = `rgb(${value}, 0, 0)`;
                } else if (channel === 'g') {
                    previewBox.style.backgroundColor = `rgb(0, ${value}, 0)`;
                } else if (channel === 'b') {
                    previewBox.style.backgroundColor = `rgb(0, 0, ${value})`;
                }
            }
        });
        number.addEventListener('input', () => {
            if (channel === 'opacity') {
                let value = parseFloat(number.value) || 0;
                if (value < 0) value = 0;
                if (value > 100) value = 100;
                slider.value = value / 100; // Convert percentage to decimal
                number.value = value;
                updatePreview(); // Update live preview with opacity
            } else {
                let value = parseInt(number.value) || 0;
                if (value < 0) value = 0;
                if (value > 255) value = 255;
                slider.value = value;
                number.value = value;
                updatePreview();
                if (channel === 'r') {
                    previewBox.style.backgroundColor = `rgb(${value}, 0, 0)`;
                } else if (channel === 'g') {
                    previewBox.style.backgroundColor = `rgb(0, ${value}, 0)`;
                } else if (channel === 'b') {
                    previewBox.style.backgroundColor = `rgb(0, 0, ${value})`;
                }
            }
        });
        number.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                updateFromRGB();
            }
        });
    };

    const rgbPreviewBoxes = modal.querySelectorAll(`#${modalId}-hexrgb .rgb-preview-box`);
    syncSliderAndNumber(rgbSliders[0], rgbNumbers[0], rgbPreviewBoxes[0], 'r');
    syncSliderAndNumber(rgbSliders[1], rgbNumbers[1], rgbPreviewBoxes[1], 'g');
    syncSliderAndNumber(rgbSliders[2], rgbNumbers[2], rgbPreviewBoxes[2], 'b');
    syncSliderAndNumber(opacitySlider, opacityNumber, livePreview, 'opacity');

    hexInput.addEventListener('input', updateFromHex);
    hexInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') updateFromHex();
    });

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

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.style.width = '80px';
    nameInput.placeholder = '前緣名稱';
    nameInput.value = datasetMap.get(fileName).name || '';
    nameInput.addEventListener('blur', () => {
        datasetMap.get(fileName).name = nameInput.value.trim();
        drawChart();
    });
    nameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            nameInput.blur();
        }
    });

    /*const delBtn = document.createElement('button');
    delBtn.textContent = '刪除';
    delBtn.onclick = () => {
        datasetMap.delete(fileName);
        entry.remove();
        drawChart();
    };*/

    entry.appendChild(colorPreview);
    entry.appendChild(nameInput);
    entry.appendChild(document.createTextNode(datasetMap.get(fileName).simplifiedName));
    //entry.appendChild(delBtn);
    container.appendChild(entry);
}

async function showDetailPanel(point, info, datasetName, dataEntry, currentIdx) {
    const panel = document.getElementById('detailPanel');
    const content = document.getElementById('detailContent');

    if (!point || !info) {
        content.innerHTML = '<p style="color:#999; font-style:italic;">無詳細資料可用</p>';
        panel.style.display = 'block';
        return;
    }

    // 依比例排序，相同比例時按照原始 index 順序
    const sortedStocks = (info.stocks || []).map((s, idx) => ({ ...s, originalIndex: idx }))
        .sort((a, b) => {
            if (b.percent !== a.percent) return b.percent - a.percent;
            return a.originalIndex - b.originalIndex;
        });

    // 確保 currentIdx 有值
    currentIdx = currentIdx ?? dataEntry.clickedIndex ?? 0;
    const total = dataEntry.data.length;

    // 取得前後 index
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : -1;
    const nextIdx = currentIdx < dataEntry.data.length - 1 ? currentIdx + 1 : -1;

    // 產生唯一 ID
    const pieChartId = `pieChart_${Date.now()}_${currentIdx}`;
    const fundChartId = `fundChart_${Date.now()}_${currentIdx}`;

    // 更新面板內容（左右分欄，各自比例）
    content.innerHTML = `
        <div style="
            display: flex;
            gap: 20px;
            align-items: stretch;   /* 左右等高 */
            height: 100%;
            min-height: 300px;      /* 避免太矮 */
        ">
            <!-- 左箭頭 -->
            ${prevIdx !== -1 ? `<button class="nav-arrow prev"></button>` : ''}

            <!-- 右箭頭 -->
            ${nextIdx !== -1 ? `<button class="nav-arrow next"></button>` : ''}

            <!-- 左側：資金水位區域 -->
                <div style="flex: 5.5; min-width: 100px; display: flex; flex-direction: column;">
                    <!-- 標題 + 切換按鈕（共用一行） -->
                    <div class="fund-header">
                        
                        <div class="fund-toggle-group">
                            <button id="btnShowChart" class="fund-toggle-btn active">Chart</button>
                            <button id="btnShowTable" class="fund-toggle-btn">Table</button>
                        </div>
                        <h4>Funds Standardization</h4>
                    </div>

                    <!-- 圖表容器 -->
                    <div id="fundChartContainer" style="width: 100%; aspect-ratio: 4 / 3; display: block;">
                        <div style="position: relative; width: 100%; height: 100%;">
                            <canvas id="${fundChartId}"></canvas>
                        </div>
                    </div>

                    <!-- 表格容器 -->
                    <div id="fundTableContainer" style="display: none;">
                        <div id="fundLevelTableSection" style="font-family: 'Times New Roman', serif;">
                            <p><strong>Loading Funds Standardization...</strong></p>
                        </div>
                    </div>
                </div>
            <!-- 右側：基本資訊 + 圓餅圖 -->
            <div style="flex: 4.5; min-width: 300px; padding-left: 10px; display: flex; flex-direction: column; gap: 20px;">
                <div style="margin-bottom: 20px;">
                    <p style="font-family: 'Times New Roman', serif; font-size: 22px; margin: 8px 0;"><strong>Risk:</strong> ${formatNum(point.x, 20)}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 22px; margin: 8px 0;"><strong>Return:</strong> ${formatNum(point.y, 20)}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 22px; margin: 8px 0;"><strong>TR:</strong> ${formatNum(point.y / point.x, 20)}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 22px; margin: 8px 0;"><strong>Constituents:</strong> ${info.count || 0} stock${(info.count || 0) === 1 ? '' : 's'}</p>
                </div>
                <div class="pie-chart-wrapper">
                    <canvas id="${pieChartId}"></canvas>
                </div>
            </div>
        </div>
    `;

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 綁定切換按鈕事件
    const btnShowChart = document.getElementById('btnShowChart');
    const btnShowTable = document.getElementById('btnShowTable');
    const chartContainer = document.getElementById('fundChartContainer');
    const tableContainer = document.getElementById('fundTableContainer');

    btnShowChart.addEventListener('click', () => {
        chartContainer.style.display = 'block';
        tableContainer.style.display = 'none';
        btnShowChart.classList.add('active');
        btnShowTable.classList.remove('active');
        btnShowChart.style.borderBottomColor = '#007BFF';
        btnShowChart.style.color = '#007BFF';
        btnShowChart.style.fontWeight = 'bold';
        btnShowTable.style.borderBottomColor = 'transparent';
        btnShowTable.style.color = '#999';
        btnShowTable.style.fontWeight = 'normal';
    });

    btnShowTable.addEventListener('click', () => {
        chartContainer.style.display = 'none';
        tableContainer.style.display = 'block';
        btnShowTable.classList.add('active');
        btnShowChart.classList.remove('active');
        btnShowTable.style.borderBottomColor = '#007BFF';
        btnShowTable.style.color = '#007BFF';
        btnShowTable.style.fontWeight = 'bold';
        btnShowChart.style.borderBottomColor = 'transparent';
        btnShowChart.style.color = '#999';
        btnShowChart.style.fontWeight = 'normal';
    });

    // 繪製圓餅圖
    if (sortedStocks.length > 0) {
        const ctx = document.getElementById(pieChartId).getContext('2d');
        
        // 生成顏色（使用色相環均勻分布）
        const colors = sortedStocks.map((_, i) => {
            const hue = (i * 360 / sortedStocks.length) % 360;
            //return `hsl(${hue}, 80%, 50%)`;
            return `hsl(${hue}, 90%, 50%)`;
        });

        // 根據數量動態調整字體大小
        const itemCount = sortedStocks.length;
        const fontSize = itemCount <= 5 ? 24 :
                            itemCount < 10 ? 20 :
                            itemCount < 15 ? 18 :
                            itemCount < 20 ? 14 :
                            itemCount < 25 ? 12 : 10

        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: sortedStocks.map(s => s.name),
                datasets: [{
                    data: sortedStocks.map(s => s.percent),
                    backgroundColor: colors,
                    borderWidth: 1,
                    borderColor: '#fff',
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Fund Allocation',
                        font: {
                            family: "'Times New Roman', serif",
                            size: 34
                        },
                        color: '#000',
                        padding: {
                            top: 0,
                            bottom: 0
                        }
                    },
                    legend: {
                        position: 'right',
                        labels: {
                            font: {
                                family: " 'Times New Roman', serif",
                                size: fontSize
                            },
                            color: '#000',
                            generateLabels: function(chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: `${label}: ${sortedStocks[i].display}`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = sortedStocks[context.dataIndex].display;
                                return `${label}: ${value}`;
                            }
                        },
                        titleFont: {
                            family: " 'Times New Roman', serif",
                            size: 0
                        },
                        bodyFont: {
                            family: " 'Times New Roman', serif",
                            size: Math.max(fontSize,18)
                        }
                    }
                }
            }
        });
    }

    document.getElementById('portfolioIndexDisplay').textContent = `Index now: ${currentIdx + 1} / ${total}`;

    // 傳入 fundChartId 讓它同時畫折線圖 + 表格
    await drawFundLevelChartAndTable(fundChartId, info, sortedStocks);
    
    // === 綁定箭頭事件 ===
    const prevBtn = content.querySelector('.nav-arrow.prev');
    const nextBtn = content.querySelector('.nav-arrow.next');

    if (prevBtn) {
        prevBtn.onclick = () => {
            dataEntry.clickedIndex = prevIdx;
            const p = dataEntry.data[prevIdx];
            const i = dataEntry.portfolioInfo[prevIdx];
            showDetailPanel(p, i, datasetName, dataEntry, prevIdx);
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            dataEntry.clickedIndex = nextIdx;
            const p = dataEntry.data[nextIdx];
            const i = dataEntry.portfolioInfo[nextIdx];
            showDetailPanel(p, i, datasetName, dataEntry, nextIdx);
        };
    }
}

function hideDetailPanel() {
    const panel = document.getElementById('detailPanel');
    const content = document.getElementById('detailContent');
    if (content) {
        content.innerHTML = ''; // 強制清空內容
    }
    panel.style.display = 'none';

    document.getElementById('nextPeriodPreviewPanel').style.display = 'none';
    if (window.nextPeriodChart) {
        window.nextPeriodChart.destroy();
        window.nextPeriodChart = null;
    }
}

function calculateFundLevel(stockPriceData, portfolioInfo, initFund) {
    //const initFund = 10000000;
    //console.log(`initfund: ${initFund}`)
    let initRemainFund = initFund;
    const allocateMoney = [];
    const stockNum = [];
    const remainMoney = [];
    const fs = [];

    // 從 portfolioInfo 中提取股票名稱和比例
    const stocks = portfolioInfo.stocks.map(s => s.name);
    const allocations = portfolioInfo.stocks.map(s => s.percent);

    // 初始化分配資金陣列
    for (let i = 0; i < stockPriceData[0].length; i++) {
        allocateMoney[i] = 0;
    }

    // 分配資金
    let index = 0;
    for (let i = 0; i < stockPriceData[0].length; i++) {
        if (index < stocks.length && stocks[index] === stockPriceData[0][i]) {
            const allocation = parseFloat(allocations[index].toFixed(2));
            allocateMoney[i] = initFund * allocation / 100;
            initRemainFund -= allocateMoney[i];
            index++;
        }
    }

    // 計算每支股票的股數和剩餘現金
    for (let i = 0; i < stockPriceData[0].length; i++) {
        if (allocateMoney[i] > 0) {
            const price = parseFloat(stockPriceData[1][i]);
            stockNum[i] = Math.floor(allocateMoney[i] / price);
            remainMoney[i] = allocateMoney[i] - stockNum[i] * price;
        } else {
            stockNum[i] = 0;
            remainMoney[i] = 0;
        }
    }

    // 計算每日資金水位 (FS)
    for (let i = 1; i < stockPriceData.length; i++) {
        if (stockPriceData[i].length % 30 !== 0) break;
        fs[i] = 0;
        for (let j = 0; j < stockPriceData[0].length; j++) {
            const price = parseFloat(stockPriceData[i][j]);
            fs[i] += price * stockNum[j] + remainMoney[j];
        }
        fs[i] += initRemainFund;
    }

    return fs;
}

async function drawFundLevelChartAndTable(chartId, portfolioInfo, sortedStocks) {
    const fundLevelTableSection = document.getElementById('fundLevelTableSection');
    const year = document.getElementById('yearInput').value;
    let period = document.getElementById('periodInput').value;
    if (currentPeriod === 'M2M') period = period.padStart(2, '0');
    const dataSource = document.getElementById('dataSourceSelect').value;
    const currentMarket = MARKET_MAP[dataSource] || 'DJIA';

    if (!year || (currentPeriod !== 'Y2Y' && !period)) {
        fundLevelTableSection.innerHTML = '<p style="color:#999; font-family: \'標楷體\', \'Times New Roman\', serif;">無法載入：未選擇日期</p>';
        return;
    }
    let portfolioFS;
    try {
        let url;
        if (currentPeriod === 'M2M')
            url = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/M2M/train_${year}_${period}%28${year}%20Q1%29.csv`;
        else if (currentPeriod === 'Q2Q')
            url = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/Q2Q/train_${year}_Q${period}%28${year}%20Q1%29.csv`;
        else if (currentPeriod === 'H2H'){
            period = Number(period)*2-1;
            url = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/H2H/train_${year}_Q${period}-Q${period+1}%28${year}%20Q1%29.csv`;
        } else if (currentPeriod === 'Y2Y')
            url = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/Y2Y/train_${year}%28${year}%20Q1%29.csv`;
        

        //console.log(url)
        //alert(`${url}`)
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) throw new Error('資料不足');

        const stockPriceData = lines.map(line => line.split(',').map(v => v.trim()));
        const headers = stockPriceData[0]; // 第一列是股票代碼
        const priceRows = stockPriceData.slice(1); // 從第二列開始是每日價格

        const initFund = 10000000;

        // === 1. 計算實際投資組合資金水位 ===
        portfolioFS = calculateFundLevel(stockPriceData, portfolioInfo, 10000000);

        // === 2. 為每檔股票計算 100% 投入的資金水位（依 sortedStocks 順序）===
        const singleStockFS = {};
        const stockIndices = {}; // 股票代碼 → 欄位索引

        // 先建立 stock → index 對應表
        headers.forEach((stock, idx) => {
            stockIndices[stock] = idx;
        });

        // 使用傳入的 sortedStocks 來決定順序與計算
        sortedStocks.forEach(stockObj => {
            const stock = stockObj.name;
            const idx = stockIndices[stock];
            if (idx === undefined) return; // 防呆

            const fs = [initFund]; // 第0天為初始資金
            const buyPrice = parseFloat(priceRows[0][idx]); // 買入當日價格
            if (isNaN(buyPrice) || buyPrice <= 0) {
                singleStockFS[stock] = Array(priceRows.length + 1).fill(initFund);
                return;
            }
            const shares = Math.floor(initFund / buyPrice);

            for (let day = 0; day < priceRows.length; day++) {
                const price = parseFloat(priceRows[day][idx]);
                if (isNaN(price) || price <= 0) {
                    fs.push(fs[fs.length - 1]);
                    continue;
                }
                const value = shares * price;
                fs.push(value);
            }
            singleStockFS[stock] = fs;
        });

        // === 3. 繪製圖表 ===
        const ctx = document.getElementById(chartId).getContext('2d');
        const labels = Array.from({ length: portfolioFS.length - 1 }, (_, i) => `${i + 1}`);

        // 主要投資組合資料
        const portfolioData = portfolioFS.slice(1);
        const portfolioGain = portfolioData.map(f => ((f - initFund) / initFund * 100).toFixed(2));

        // 單股資料集
        const singleStockDatasets = sortedStocks.map((stockObj, i) => {
            const stock = stockObj.name;
            const fs = singleStockFS[stock] || Array(priceRows.length + 1).fill(initFund);
            const data = fs.slice(1);
            const hue = (i * 360 / sortedStocks.length) % 360;
            //const color = `hsl(${hue}, 70%, 90%)`;
            const color = `hsl(${hue}, 80%, 90%)`;
            return {
                label: `${stock}`,
                data: data,
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.1,
                yAxisID: 'y'
            };
        });

        // 主要投資組合（粗線、不透明）
        const mainDataset = {
            label: 'Portfolio',
            data: portfolioData,
            borderColor: '#007BFF',
            backgroundColor: '#007BFF',
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: '#007BFF',
            pointBorderColor: '#0069D9',
            fill: false,
            tension: 0.1,
            yAxisID: 'y'
        };

        // Gain % 隱藏線（用於 tooltip）
        const gainDataset = {
            label: 'Gain (%)',
            data: portfolioGain,
            borderWidth: 0,
            pointRadius: 0,
            yAxisID: 'y1',
            hoverBackgroundColor: 'transparent',
            tooltip: { enabled: false }
        };

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [mainDataset, ...singleStockDatasets, gainDataset]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: {
                            font: { family: " 'Times New Roman', serif", size: 22, weight: 'bold' },
                            color: '#000',
                            maxTicksLimit: 25,
                        },
                        title: {
                            display: true,
                            text: 'Days',
                            font: { family: " 'Times New Roman', serif", size: 26, weight: 'bold' },
                            color: '#000'
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: value => `$${formatNum(value, 0)}`,
                            font: { family: " 'Times New Roman', serif", size: 20, weight: 'bold' },
                            color: '#000'
                        },
                        title: {
                            display: true,
                            text: 'Funds Standardization',
                            font: { family: " 'Times New Roman', serif", size: 26, weight: 'bold' },
                            color: '#000'
                        }
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        border: { display: true },
                        title: {
                            display: true,
                            text: 'Gain (%)',
                            font: { family: " 'Times New Roman', serif", size: 26, weight: 'bold' },
                            color: '#000'
                        },
                        ticks: {
                            callback: function(value, index, ticks) {
                                const yScale = this.chart.scales.y;
                                const yMin = yScale.min;
                                const yMax = yScale.max;
                                const tickCount = yScale.ticks.length;
                                const initFund = 10_000_000;
                                
                                // 根據主 y 軸 tick index 對應的實際 fund 值
                                const fundValue = yMin + (index / (tickCount - 1)) * (yMax - yMin);
                                const gainPercent = (fundValue - initFund) / initFund * 100;

                                const rangeRatio = (yMax - yMin) / initFund;
                                const decimals = rangeRatio > 0.10 ? 0 : rangeRatio > 0.05 ? 1 : 2;


                                const sign = gainPercent >= 0 ? '+' : '';
                                return `${sign}${gainPercent.toFixed(decimals)}%`;
                            },
                            font: { family: "'Times New Roman', serif", size: 20, weight: 'bold' },
                            color: '#000'
                        },
                        // 讓 y1 範圍與 y 軸同步
                        afterDataLimits: function(scale) {
                            const yScale = scale.chart.scales.y;
                            scale.min = yScale.min;
                            scale.max = yScale.max;
                        }
                    }
                },
                plugins: {
                    title: { display: false },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: { family: "'Times New Roman', serif", size: 16 },
                            color: '#000',
                            filter: item => item.text !== 'Gain (%)' // 隱藏 Gain % 圖例
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: context => `Day: ${context[0].label}`,
                            label: function(context) {
                                const fund = context.parsed.y;
                                const gain = ((fund - initFund) / initFund * 100).toFixed(2);
                                const sign = gain > 0 ? '+' : '';
                                if (context.dataset.label === 'Portfolio') {
                                    return [
                                        `Fund: $${formatNum(fund, 2)}`,
                                        `Gain: ${sign}${gain}%`
                                    ];
                                } else {
                                    return `${context.dataset.label}: $${formatNum(fund, 2)} (${sign}${gain}%)`;
                                }
                            }
                        },
                        titleFont: { family: " 'Times New Roman', serif", size: 14, weight: 'bold' },
                        bodyFont: { family: " 'Times New Roman', serif", size: 14 },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        cornerRadius: 6,
                        displayColors: true
                    }
                }
            }
        });

        // === 表格保持不變（只顯示 Portfolio）===
        let tableHTML = `
            <h4 style="margin: 15px 0 8px; text-align: center; font-family: 'Times New Roman', serif;"></h4>
            <div style="max-height: 500px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 16px; font-family: 'Times New Roman', serif;">
                    <thead style="background: #f8f9fa; position: sticky; top: 0; font-size: 18px; font-weight: bold;">
                        <tr>
                            <th style="border: 1px solid #ccc; padding: 6px;">Days</th>
                            <th style="border: 1px solid #ccc; padding: 6px;">Fund</th>
                            <th style="border: 1px solid #ccc; padding: 6px;">Gain(%)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        for (let i = 1; i < portfolioFS.length; i++) {
            if (!portfolioFS[i]) continue;
            const change = ((portfolioFS[i] - initFund) / initFund * 100).toFixed(2);
            const color = portfolioFS[i] >= initFund ? 'green' : 'red';
            tableHTML += `
                <tr>
                    <td style="border: 1px solid #ccc; padding: 5px; text-align: center;">${i}</td>
                    <td style="border: 1px solid #ccc; padding: 5px; text-align: center;">${formatNum(portfolioFS[i], 2)}</td>
                    <td style="border: 1px solid #ccc; padding: 5px; text-align: center; color: ${color};">
                        ${change > 0 ? '+' : ''}${change}%
                    </td>
                </tr>
            `;
        }
        tableHTML += `</tbody></table></div>`;
        fundLevelTableSection.innerHTML = tableHTML;

    } catch (error) {
        fundLevelTableSection.innerHTML = `<p style="color: #c00; font-family: '標楷體', 'Times New Roman', serif;">載入失敗: ${error.message}</p>`;
        console.error(error);
    }
    
    updateNextPeriodPreview(currentMarket, year, period, portfolioInfo, portfolioFS); // info = 當前投資組合比例
    
    document.getElementById('nextPeriodPreviewPanel').style.display = 'block';
}

async function updateNextPeriodPreview(currentMarket, currentYear, nowPeriod, portfolioInfo, portfolioFS) {
    const year = parseInt(currentYear);
    let period = parseInt(nowPeriod);
    let nowURL;
    if (currentPeriod === "M2M"){
        nowURL = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/M2M/train_${year}_${String(period).padStart(2,'0')}%28${year}%20Q1%29.csv`;
    }else if (currentPeriod === "Q2Q") {
        nowURL = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/Q2Q/train_${year}_Q${period}%28${year}%20Q1%29.csv`;
    }
    //document.getElementById('current-url-display').textContent = nowURL;

    if(currentPeriod != 'Y2Y') period += 1;
    let nextUrl, temp_test_year=year, nextMonthStr;
    if (currentPeriod === "M2M"){
        if (period > 12) {
            period = 1;
            var nextYear = year + 1;
        } else { var nextYear = year; }
        nextMonthStr = String(period).padStart(2, '0');
        if(period===1) temp_test_year = nextYear-1;
        nextUrl = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/M2M/test_${nextYear}_${nextMonthStr}%28${temp_test_year}%20Q1%29.csv`;
    } else if (currentPeriod === "Q2Q") {
        if (period > 4) {
            period = 1;
            var nextYear = year + 1;
        } else { var nextYear = year; }
        if(period===1) temp_test_year = nextYear-1;
        nextUrl = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/Q2Q/test_${nextYear}_Q${period}%28${temp_test_year}%20Q1%29.csv`;
    } else if (currentPeriod === "H2H") {
        period = 2*period-1;
        if (period > 3) {
            period = 1;
            var nextYear = year + 1;
        } else { var nextYear = year; }
        if(period===1) temp_test_year = nextYear-1;
        nextUrl = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/H2H/test_${nextYear}_Q${period}-Q${period+1}%28${temp_test_year}%20Q1%29.csv`;
    } else if (currentPeriod === "Y2Y") {
        var nextYear = year + 1;
        temp_test_year = nextYear-1;
        nextUrl = `https://pingi0131.github.io/compare_fronts/stock_price/${currentMarket}/Y2Y/test_${nextYear}%28${temp_test_year}%20Q1%29.csv`;
    }
    //console.log(nextUrl)

    //document.getElementById('next-url-display').textContent = nextUrl;

    // 清除舊圖表
    const canvas = document.getElementById('nextPeriodFundChart');
    const ctx = canvas.getContext('2d');
    if (window.nextPeriodChart) window.nextPeriodChart.destroy();

    // 預設線（當前區間）
    const currentFS = portfolioFS.slice(1);
    //const labels = currentFS.map((_, i) => `${i + 1}`);

    // 載入下期資料
    let nextFS = [];
    try {
        const res = await fetch(nextUrl);
        if (res.ok) {
            const text = await res.text();
            const lines = text.trim().split('\n').map(l => l.trim());
            const data = lines.map(line => line.split(',').map(v => v.trim()));
            nextFS = calculateFundLevel(data, portfolioInfo, currentFS[currentFS.length - 1]);
        }
    } catch (e) {
        console.warn('Next period not available yet');
    }

    // 合併時，nextFS 第一筆會等於 currentFS 最後一筆 → 完美接續
    const combinedData = [...currentFS, ...nextFS.slice(1)];  // 去掉重複的第一筆
    const splitIndex = currentFS.length; // 分界點（歷史結束位置）

    
    // X 軸標籤：從 1 開始連續編號
    const labels = combinedData.map((_, i) => `${i + 1}`);

    let now_label, next_label;
    if(currentPeriod === "M2M") {
        now_label = `Train Period: ${year}_${nowPeriod.padStart(2,'0')}`;
        next_label = `Test Period: ${nextYear}_${nextMonthStr}`
    } else if(currentPeriod === "Q2Q") {
        now_label = `Train Period: ${year}_Q${nowPeriod}`;
        next_label = `Test Period: ${nextYear}_Q${period}`
    } else if(currentPeriod === "H2H") {
        now_label = `Train Period: ${year}_Q${nowPeriod}-Q${nowPeriod+1}`;
        next_label = `Test Period: ${nextYear}_Q${period}-Q${period+1}`
    } else if(currentPeriod === "Y2Y") {
        now_label = `Train Period: ${year}`;
        next_label = `Test Period: ${nextYear}`
    }

    let bw = 3;  // default for smaller
    if (currentPeriod === 'M2M' || currentPeriod === 'Q2Q') bw = 5;
    else if (currentPeriod === 'H2H') bw = 4;
    else if (currentPeriod === 'Y2Y') bw = 3;

    let dashStyle = [];
    if (currentPeriod === 'M2M' || currentPeriod === 'Q2Q') dashStyle = [20, 5];     // 虛線
    else if (currentPeriod === 'H2H') dashStyle = [12, 5];     // 中短虛線
    else if (currentPeriod === 'Y2Y') dashStyle = [5, 2];      // 點線感覺

    //console.log(nextFS)
    window.nextPeriodChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: now_label,
                    data: combinedData.map((v, i) => i < splitIndex ? v : null), // 只畫歷史部分
                    borderColor: '#007BFF',
                    backgroundColor: '#007BFF',
                    borderWidth: bw,
                    pointRadius: 0,
                    tension: 0.15,
                    fill: false,
                },
                {
                    //label: nextFS.length ? next_label : '',
                    label: next_label,
                    data: combinedData.map((v, i) => i >= splitIndex-1 ? v : null), // 只畫未來部分
                    borderColor: 'rgba(255, 68, 68, 0.5)',
                    backgroundColor: 'rgba(255, 68, 68, 0.5)',
                    borderWidth: bw,
                    borderDash: [20, 5],
                    pointRadius: 0,
                    tension: 0.15,
                    fill: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    ticks: { 
                        callback: v => `$${formatNum(v, 0)}`, 
                        font: { size: 22, family: 'Times New Roman', weight: 'bold' },
                        color: '#000',
                    },
                    title: { 
                        display: true, 
                        text: 'Funds Standardization', 
                        font: { size: 24, family: 'Times New Roman', weight: 'bold' },
                        color: '#000',
                    },
                    color: '#000'
                },
                x: {
                    ticks: {
                        font: { family: " 'Times New Roman', serif", size: 24, weight: 'bold' },
                        color: '#000',
                        maxTicksLimit: 30,
                    },
                    title: {
                        display: true,
                        text: 'Days', 
                        font: { size: 28, family: 'Times New Roman', weight: 'bold' },
                        color: '#000',
                    },
                    color: '#000',
                    grid: { display: false } 
                }
            },
            plugins: {
                legend: { 
                    labels: { 
                        font: { size: 20, family: 'Times New Roman' },
                        color: '#000000'
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (!ctx.parsed.y) return `${ctx.dataset.label}: No data yet`;
                            const gain = ((ctx.parsed.y - 10000000) / 10000000 * 100).toFixed(2);
                            return `${ctx.dataset.label}: $${formatNum(ctx.parsed.y, 2)} (${gain > 0 ? '+' : ''}${gain}%)`;
                        }
                    }
                }
            }
        }
    });
}

function drawChart() {
    const ctx = document.getElementById('riskProfitChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const datasets = Array.from(datasetMap.entries()).map(([fileName, { data, color, name, pointRadius }]) => ({
        label: name || fileName,
        data: data,
        backgroundColor: color,
        borderColor: color,
        pointRadius: pointRadius || 2, // Use per-algorithm point radius
        hoverRadius: pointRadius || 2, // Match hover radius to point radius
        showLine: true,
        fill: false,
        tension: 0,
        dragData: false
    }));
    
    const minX = parseFloat(minRiskInput.value);
    const maxX = parseFloat(maxRiskInput.value);
    const minY = parseFloat(minProfitInput.value);
    const maxY = parseFloat(maxProfitInput.value);
    const xMin = isNaN(minX) ? initialRanges.minRisk : minX;
    const xMax = isNaN(maxX) ? initialRanges.maxRisk : maxX;
    const yMin = isNaN(minY) ? initialRanges.minProfit : minY;
    const yMax = isNaN(maxY) ? initialRanges.maxProfit : maxY;

    // Get selected date and format title
    // === 客製化標題：演算法名稱 in [WPM/EPM] Model Frontier with Fund Level in 月 年 ===
    const selectedDate = document.querySelector('.date-entry.selected');
    let title = 'Frontier with Funds Standardization';

    if (selectedDate) {
        const year = selectedDate.dataset.year;
        const period = selectedDate.dataset.period;
        //alert(`${year} ${period}`)
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        let periodName;
        if (currentPeriod === 'M2M')
            periodName = monthNames[parseInt(period, 10) - 1] || 'Unknown';
        else if (currentPeriod === 'Q2Q')
            periodName = period || 'Unknown';
        else if (currentPeriod === 'H2H'){
            let fullPeriodName = period.replace('H','');
            fullPeriodName = Number(fullPeriodName)*2-1;
            periodName = `Q${fullPeriodName}-Q${fullPeriodName+1}` || 'Unknown';
        }else if (currentPeriod === 'Y2Y')
            periodName = '';

        // 取得目前選擇的 dataSource
        const dataSourceSelect = document.getElementById('dataSourceSelect');
        const selectedOption = dataSourceSelect.options[dataSourceSelect.selectedIndex];
        const dataSourceValue = selectedOption.value; // e.g., "WPM_MoQTS", "EPM_H-MoQTS"

        const parts = dataSourceValue.split(/[_\s]+/); // 分割符號：_ 或 - 或 空白
        const modelType = parts[0] || 'Unknown';
        const algorithmName = parts[1] || 'Unknown';

        // 組合最終標題
        title = `${algorithmName} Frontier in ${modelType} with Funds Standardization in ${periodName} ${year}`;
    }
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                // 點擊圖表空白處 → 隱藏
                /*if (elements.length === 0) {
                    hideDetailPanel();
                    return;
                }*/
                if (elements.length === 0) return;

                const element = elements[0];
                const datasetIndex = element.datasetIndex;
                const dataIndex = element.index;            // 目前點擊的portfolio 的 index

                const fileName = Array.from(datasetMap.keys())[datasetIndex];
                const dataEntry = datasetMap.get(fileName);

                if (!dataEntry || !dataEntry.portfolioInfo || dataIndex >= dataEntry.portfolioInfo.length) {
                    hideDetailPanel();
                    alert('錯誤：無法取得該點的投資組合資料');
                    return;
                }

                const point = dataEntry.data[dataIndex];
                const info = dataEntry.portfolioInfo[dataIndex];

                //alert(`index now: ${dataIndex}`)
                // 更新點擊 index
                dataEntry.clickedIndex = dataIndex;

                // 呼叫新版 showDetailPanel
                showDetailPanel(point, info, dataEntry.name || fileName, dataEntry, dataIndex);
            },
            plugins: {
                title: {
                    display: true,
                    text: title, // Dynamic title with date
                    font: {
                        family: 'Times New Roman',
                        size: 32,
                        weight: 'bold'
                    },
                    color: '#000'
                },
                tooltip: {
                    titleFont: {
                        family: 'Times New Roman',
                        size: 14
                    },
                    bodyFont: {
                        family: 'Times New Roman',
                        size: 14
                    },
                    //bodyAlign: 'center',
                    //itemAlign: 'center',
                    callbacks: {
                        label: function(context) {
                            const point = context.parsed;
                            const datasetIndex = context.datasetIndex;
                            const dataIndex = context.dataIndex;
                            const fileName = Array.from(datasetMap.keys())[datasetIndex];
                            const dataEntry = datasetMap.get(fileName);

                            // 防呆：若無 portfolioInfo 或索引超出範圍
                            if (!dataEntry || !dataEntry.portfolioInfo || dataIndex >= dataEntry.portfolioInfo.length) {
                                return `${context.dataset.label}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
                            }

                            const info = dataEntry.portfolioInfo[dataIndex];
                            const maxDisplay = 3;

                            let displayedStocks;
                            let hasMore = info.stocks.length > maxDisplay;

                            if (info.stocks.length > maxDisplay) {
                                // 僅超過 3 檔時排序：比例降序 → 原始 index 升序
                                displayedStocks = info.stocks
                                    .map((stock, index) => ({ ...stock, originalIndex: index }))
                                    .sort((a, b) => {
                                        if (b.percent !== a.percent) return b.percent - a.percent;
                                        return a.originalIndex - b.originalIndex;
                                    })
                                    .slice(0, maxDisplay);
                            } else {
                                // 3 檔或以下：直接用原始順序
                                displayedStocks = info.stocks.slice(0, maxDisplay);
                            }

                            const stockStr = displayedStocks
                                .map(s => `${s.name}(${s.display})`)
                                .join(' ') + (hasMore ? ' ...' : '');

                            return [
                                `Risk: ${formatNum(point.x)} Return: ${formatNum(point.y)} TR: ${formatNum(point.y/point.x,6)}`,
                                `Contain ${info.count} stocks: ${stockStr}`
                            ];
                        }
                    }
                },
                legend: {
                    labels: {
                        font: {
                            family: 'Times New Roman',
                            size: 16,
                            weight: 'bold'
                        },
                        color: '#000000'
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        modifierKey: null,
                        threshold: 2,
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'xy',
                    }
                },
                /*dragData: {
                    enabled: true,
                    onDragStart: function (e, datasetIndex, index, value) {
                        console.log('Drag started:', datasetIndex, index, value);
                    },
                    onDrag: function (e, datasetIndex, index, value) {
                        const fileName = Array.from(datasetMap.keys())[datasetIndex];
                        const dataset = datasetMap.get(fileName);
                        dataset.data[index] = { x: value.x, y: value.y };
                        datasetMap.set(fileName, dataset);
                    },
                    onDragEnd: function (e, datasetIndex, index, value) {
                        const fileName = Array.from(datasetMap.keys())[datasetIndex];
                        const dataset = datasetMap.get(fileName);
                        dataset.data[index] = { x: value.x, y: value.y };
                        datasetMap.set(fileName, dataset);
                        drawChart(); // Redraw chart and recalculate metrics
                    }
                },*/
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Daily Risk',
                        font: {
                            family: 'Times New Roman',
                            size: 24,
                            weight: 'bold'
                        },
                        color: '#000000'
                    },
                    ticks: {
                        font: {
                            family: 'Times New Roman',
                            size: 20,
                            weight: 'bold'
                        },
                        color: '#000000'
                    },
                    min: xMin,
                    max: xMax
                },
                y: {
                    title: {
                        display: true,
                        text: 'Daily Expected Return',
                        font: {
                            family: 'Times New Roman',
                            size: 24,
                            weight: 'bold'
                        },
                        color: '#000000'
                    },
                    ticks: {
                        font: {
                            family: 'Times New Roman',
                            size: 20,
                            weight: 'bold'
                        },
                        color: '#000000'
                    },
                    min: yMin,
                    max: yMax
                }
            }
        }
    });
    document.getElementById('chart-container').style.display = 'block';
    document.getElementById('chart-wrapper').style.display = 'block';
    document.getElementById('chart-container').addEventListener('dblclick', function () {
        chartInstance.resetZoom();
    });

    // === 新增：快速按鈕事件綁定 ===
    const btnHighestReturn = document.getElementById('btn-highest-return');
    const btnHighestTR = document.getElementById('btn-highest-tr');
    const btnLowestRisk = document.getElementById('btn-lowest-risk');

    // 移除舊的事件監聽（避免重複綁定）
    [btnHighestReturn, btnHighestTR, btnLowestRisk].forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    const newBtnHR = document.getElementById('btn-highest-return');
    const newBtnTR = document.getElementById('btn-highest-tr');
    const newBtnLR = document.getElementById('btn-lowest-risk');

    const [fileName, dataEntry] = Array.from(datasetMap.entries())[0];
    const total = dataEntry.data.length;

    // Highest Return: 最後一個點
    newBtnHR.onclick = () => {
        if (total === 0) return;
        const idx = total - 1;
        const point = dataEntry.data[idx];
        const info = dataEntry.portfolioInfo[idx];
        dataEntry.clickedIndex = idx;
        showDetailPanel(point, info, dataEntry.name || fileName, dataEntry, idx);
    };

    // Highest TR: maxTRIdx
    newBtnTR.onclick = () => {
        if (total === 0 || dataEntry.maxTRIndex === undefined) return;
        const idx = dataEntry.maxTRIndex;
        const point = dataEntry.data[idx];
        const info = dataEntry.portfolioInfo[idx];
        dataEntry.clickedIndex = idx;
        showDetailPanel(point, info, dataEntry.name || fileName, dataEntry, idx);
    };

    // Lowest Risk: 第一個點
    newBtnLR.onclick = () => {
        if (total === 0) return;
        const idx = 0;
        const point = dataEntry.data[idx];
        const info = dataEntry.portfolioInfo[idx];
        dataEntry.clickedIndex = idx;
        showDetailPanel(point, info, dataEntry.name || fileName, dataEntry, idx);
    };

    // 顯示按鈕
    document.getElementById('quick-action-buttons').style.display = 'flex';
}
