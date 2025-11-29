let chartInstance = null;
const datasetMap = new Map();
const defaultColors = [
'#0000FF', '#FFA500', '#888888', '#00AA00',
'#9739A8', '#E53935', '#20B2C2', '#3F51B5', '#00796B', '#D81B60'
];



//const defaultColors = ['#0000FF', '#FFA500', '#888888', '#00AA00'];
let combinedFront = null;

let initialRanges = {
    minRisk: undefined,
    maxRisk: undefined,
    minProfit: undefined,
    maxProfit: undefined
};

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

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        // Skip if file already exists in datasetMap to avoid overwriting
        if (datasetMap.has(file.name)) {
            console.log(`檔案 ${file.name} 已存在，跳過重複上傳。可能是檔名相同～`);
            continue;
        }

        try {
            const fileName = file.name;
            const extension = fileName.split('.').pop().toLowerCase();
            let parsed = [];

            if (extension === 'csv') {
                const text = await file.text();
                const lines = text.split(/\r?\n/);
                if (lines.length === 0) continue;

                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const riskIndex = headers.findIndex(h => h.includes('risk'));
                const profitIndex = headers.findIndex(h => h.includes('profit') || h.includes('return'));

                if (riskIndex === -1 || profitIndex === -1) {
                    console.error(`檔案 ${fileName} 缺少 'risk' 或 'profit'/'return' 欄位`);
                    continue;
                }

                const parsedSet = new Set();
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = line.split(',');
                    const x = parseFloat(cols[riskIndex]);
                    const y = parseFloat(cols[profitIndex]);
                    const key = `${x},${y}`;

                    if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0 && !parsedSet.has(key)) {
                        parsedSet.add(key);
                        parsed.push({ x, y });
                    }
                }
            } else if (extension === 'xlsx' || extension === 'xls') {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (json.length === 0) continue;

                const headers = json[0].map(h => h.toString().trim().toLowerCase());
                const riskIndex = headers.findIndex(h => h.includes('risk'));
                const profitIndex = headers.findIndex(h => h.includes('profit') || h.includes('return'));

                if (riskIndex === -1 || profitIndex === -1) {
                    console.error(`檔案 ${fileName} 缺少 'risk' 或 'profit'/'return' 欄位`);
                    continue;
                }

                const parsedSet = new Set();
                for (let i = 1; i < json.length; i++) {
                    const row = json[i];
                    const x = parseFloat(row[riskIndex]);
                    const y = parseFloat(row[profitIndex]);
                    const key = `${x},${y}`;

                    if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0 && !parsedSet.has(key)) {
                        parsedSet.add(key);
                        parsed.push({ x, y });
                    }
                }
            } else {
                console.error(`不支援的檔案格式: ${fileName}`);
                continue;
            }

            if (parsed.length > 0) {
                const color = defaultColors[datasetMap.size % defaultColors.length] || '#000000';
                const nameMappings = {
                    'MOQTS': 'MoQTS',
                    'MOEA': 'MOEA/D',
                    'NSGA': 'NSGA-II',
                    'EMOA': 'SMS-EMOA',
                    'PAES': 'PAES',
                    'MOPSO': 'MOPSO',
                    'SPEA': 'SPEA2',
                    'GA': 'GA',
                    'GENE': 'GA',
                };
                const assignedKey = Object.keys(nameMappings).find(key =>
                    fileName.toUpperCase().includes(key)
                );
                const assignedName = assignedKey ? nameMappings[assignedKey] : '';

                datasetMap.set(fileName, {
                    name: assignedName,
                    data: parsed.sort((a, b) => a.x - b.x),
                    color,
                    simplifiedName: fileName,
                    pointRadius: 2
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
        calculateMetrics();
    } else {
        alert('沒有成功載入任何有效的 CSV 或 Excel 檔案');
    }
    updateFileCount(); // Add this line to update the file count
}

function updateFileCount() {
    const fileCountSpan = document.getElementById('fileCount');
    fileCountSpan.textContent = `已上傳 ${datasetMap.size} 個檔案`;
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    fileInput.addEventListener('change', handleFileUpload);
    uploadBtn.addEventListener('click', () => {
        fileInput.click(); // Trigger file input click when button is clicked
    });
    updateFileCount(); // Initialize file count
});

const minRiskInput = document.getElementById('minRisk');
const maxRiskInput = document.getElementById('maxRisk');
const minProfitInput = document.getElementById('minProfit');
const maxProfitInput = document.getElementById('maxProfit');
const defaultRanges = {
    minRisk: undefined,
    maxRisk: undefined,
    minProfit: undefined,
    maxProfit: undefined,
    pointRadiusInput: 2
};
[minRiskInput, maxRiskInput, minProfitInput, maxProfitInput].forEach(input => {
    input.addEventListener('blur', () => {
        if (datasetMap.size > 0) {
            drawChart();
            calculateMetrics();
            if (document.getElementById('metricsTableContainer').style.display === 'block') {
                generateMetricsTable();
            }
        }
    });
    input.addEventListener('keypress', e => {
        if (e.key === 'Enter' && datasetMap.size > 0) {
            drawChart();
            calculateMetrics();
            if (document.getElementById('metricsTableContainer').style.display === 'block') {
                generateMetricsTable();
            }
        }
    });
});

function resetField(fieldId) {
    document.getElementById(fieldId).value = defaultRanges[fieldId] ?? '';
    //alert(`${document.getElementById(fieldId).value}`);
    if (datasetMap.size > 0) {
        drawChart();
        calculateMetrics();
        if (document.getElementById('metricsTableContainer').style.display === 'block') {
            generateMetricsTable();
        }
    }
}

function resetAllRanges() {
    for (const key in initialRanges) {
        document.getElementById(key).value = initialRanges[key] !== undefined ? initialRanges[key].toFixed(2) : '';
    }
    if (datasetMap.size > 0) {
        drawChart();
        calculateMetrics();
        if (document.getElementById('metricsTableContainer').style.display === 'block') {
            generateMetricsTable();
        }
    }
}

function resetColors() {
    const entries = Array.from(datasetMap.entries());
    entries.forEach(([fileName, data], index) => {
        const newColor = defaultColors[index % defaultColors.length] || '#000000';
        data.color = newColor;
        data.pointRadius = 2;
        const entryDiv = document.getElementById(`entry-${CSS.escape(fileName)}`);
        if (entryDiv) {
            const colorPreview = entryDiv.querySelector('.color-preview-box-list');
            if (colorPreview) {
                colorPreview.style.backgroundColor = newColor;
            }
            const radiusInput = entryDiv.querySelector('.point-radius-input');
            if (radiusInput) {
                radiusInput.value = 2;
            }
            const modal = entryDiv.querySelector('.color-picker-modal');
            if (modal) {
                const hexInput = modal.querySelector('.hex-input');
                const rgbSliders = modal.querySelectorAll('.rgb-slider');
                const rgbNumbers = modal.querySelectorAll('.rgb-number');
                const rgbPreviewBoxes = modal.querySelectorAll('.rgb-preview-box');
                const opacitySlider = modal.querySelector('.opacity-slider');
                const opacityNumber = modal.querySelector('.opacity-number');
                const livePreview = modal.querySelector('.live-preview');
                const nativeColorInput = modal.querySelector('.native-color-input');

                const r = parseInt(newColor.slice(1, 3), 16);
                const g = parseInt(newColor.slice(3, 5), 16);
                const b = parseInt(newColor.slice(5, 7), 16);
                const a = 1;

                hexInput.value = newColor;
                rgbSliders[0].value = r;
                rgbSliders[1].value = g;
                rgbSliders[2].value = b;
                rgbNumbers[0].value = r;
                rgbNumbers[1].value = g;
                rgbNumbers[2].value = b;
                rgbPreviewBoxes[0].style.backgroundColor = `rgb(${r}, 0, 0)`;
                rgbPreviewBoxes[1].style.backgroundColor = `rgb(0, ${g}, 0)`;
                rgbPreviewBoxes[2].style.backgroundColor = `rgb(0, 0, ${b})`;
                opacitySlider.value = a;
                opacityNumber.value = Math.round(a * 100);
                livePreview.style.backgroundColor = newColor;
                livePreview.style.opacity = a;
                nativeColorInput.value = newColor;
            }
        }
    });
    if (datasetMap.size > 0) {
        drawChart();
    }
    document.getElementById('resetColorsBtn').style.display = datasetMap.size > 0 ? 'inline-block' : 'none';
}

function normalize(data) {
    const allRisks = Object.values(data).flatMap(d => d.risk);
    const allProfits = Object.values(data).flatMap(d => d.profit);
    const minRisk = Math.min(...allRisks);
    const maxRisk = Math.max(...allRisks) * 1.01;
    const minProfit = Math.min(...allProfits) * 0.99;
    const maxProfit = Math.max(...allProfits);
    console.log(`Normalization bounds: min risk:${minRisk}, max risk:${maxRisk}, min profit:${minProfit}, max profit:${maxProfit}`);
    const result = {};
    for (const name in data) {
        const normalizedRisk = [];
        const normalizedProfit = [];
        for (let i = 0; i < data[name].risk.length; i++) {
            const risk = data[name].risk[i];
            const profit = data[name].profit[i];
            const newRisk = (risk - minRisk) / (maxRisk - minRisk);
            const newProfit = (profit - minProfit) / (maxProfit - minProfit);
            normalizedRisk.push(newRisk);
            normalizedProfit.push(newProfit);
        }
        result[name] = {
            risk: normalizedRisk,
            profit: normalizedProfit
        };
    }
    return result;
}

function combineNonDominatedSets(dataSets) {
    const combinedRisk = [];
    const combinedProfit = [];
    for (const [_, dataSet] of dataSets.entries()) {
        for (let i = 0; i < dataSet.data.length; i++) {
            const risk = dataSet.data[i].x;
            const profit = dataSet.data[i].y;
            let addNew = true;
            let j = 0;
            while (j < combinedRisk.length) {
                if (profit <= combinedProfit[j] && risk >= combinedRisk[j]) {
                    addNew = false;
                    break;
                }
                if (profit > combinedProfit[j] && risk < combinedRisk[j]) {
                    combinedRisk.splice(j, 1);
                    combinedProfit.splice(j, 1);
                } else {
                    j++;
                }
            }
            if (addNew) {
                combinedRisk.push(risk);
                combinedProfit.push(profit);
            }
        }
    }
    const sortedPairs = combinedRisk.map((risk, i) => [risk, combinedProfit[i]])
        .sort((a, b) => a[0] - b[0]);
    const sortedRisk = sortedPairs.map(pair => pair[0]);
    const sortedProfit = sortedPairs.map(pair => pair[1]);
    return {
        risk: sortedRisk,
        profit: sortedProfit
    };
}

function calcGD(normalized, frontKey) {
    const result = {};
    const normalizedFront = {
        risk: normalized[frontKey].risk,
        profit: normalized[frontKey].profit
    };
    for (const name in normalized) {
        const data = normalized[name];
        let sumMin = 0.0;
        for (let i = 0; i < data.risk.length; i++) {
            const risk = data.risk[i];
            const profit = data.profit[i];
            let minDis = Infinity;
            for (let j = 0; j < normalizedFront.risk.length; j++) {
                const pRisk = normalizedFront.risk[j];
                const pProfit = normalizedFront.profit[j];
                const distance = Math.sqrt(Math.pow(pRisk - risk, 2) + Math.pow(pProfit - profit, 2));
                if (distance < minDis) {
                    minDis = distance;
                }
            }
            sumMin += Math.pow(minDis, 2);
        }
        result[name] = Math.sqrt(sumMin) / data.risk.length;
    }
    return result;
}

function calcIGD(normalized, frontKey) {
    const result = {};
    const normalizedFront = {
        risk: normalized[frontKey].risk,
        profit: normalized[frontKey].profit
    };
    for (const name in normalized) {
        const data = normalized[name];
        let sumMin = 0.0;
        for (let j = 0; j < normalizedFront.risk.length; j++) {
            const pRisk = normalizedFront.risk[j];
            const pProfit = normalizedFront.profit[j];
            let minDis = Infinity;
            for (let i = 0; i < data.risk.length; i++) {
                const risk = data.risk[i];
                const profit = data.profit[i];
                const distance = Math.sqrt(Math.pow(pRisk - risk, 2) + Math.pow(pProfit - profit, 2));
                if (distance < minDis) {
                    minDis = distance;
                }
            }
            sumMin += Math.pow(minDis, 2);
        }
        result[name] = Math.sqrt(sumMin) / normalizedFront.risk.length;
    }
    return result;
}

function calcHV(normalized) {
    const result = {};
    const refPointX = 1.0;
    const refPointY = 0.0;
    for (const name in normalized) {
        let hv = 0;
        const r = normalized[name].risk;
        const p = normalized[name].profit;
        const sortedIndices = Array.from({ length: r.length }, (_, i) => i)
            .sort((a, b) => r[a] - r[b]);
        let prevProfit = refPointY;
        for (const idx of sortedIndices) {
            const risk = r[idx];
            const profit = p[idx];
            if (profit > prevProfit) {
                hv += Math.abs((refPointX - risk) * (profit - prevProfit));
                prevProfit = profit;
            }
        }
        result[name] = hv;
    }
    return result;
}

function calculateHitRate(normalized) {
    const hitRate = {};
    const hitCounts = {};
    const coRisk = normalized["Combined Front"].risk;
    const numCo = coRisk.length;
    for (const name in normalized) {
        let time = 0;
        const otherRisk = normalized[name].risk;
        for (const r of otherRisk) {
            if (coRisk.some(coR => Math.abs(coR - r) < 1e-10)) {
                time += 1;
            }
        }
        hitRate[name] = numCo > 0 ? (time / numCo) * 100 : 0;
        hitCounts[name] = {
            hits: time,
            total: numCo
        };
    }
    return {
        percentages: hitRate,
        counts: hitCounts
    };
}

function checkAllNames() {
    for (const [fileName, data] of datasetMap) {
        if (!data.name.trim()) {
            return false;
        }
    }
    return true;
}

function calculateMetrics() {
    const showTableBtn = document.getElementById('showTableBtn');
    if (datasetMap.size < 2) {
        document.getElementById('metricsOutput').style.display = 'none';
        document.getElementById('metricsTableContainer').style.display = 'none';
        showTableBtn.style.display = 'none';
        return;
    }

    const minRisk = parseFloat(minRiskInput.value);
    const maxRisk = parseFloat(maxRiskInput.value);
    const minProfit = parseFloat(minProfitInput.value);
    const maxProfit = parseFloat(maxProfitInput.value);

    const filteredMap = filterDataByRange(datasetMap, minRisk, maxRisk, minProfit, maxProfit);

    if (filteredMap.size < 2) {
        document.getElementById('metricsOutput').textContent = '設定的風險報酬範圍沒有解，確認放大區域數值範圍';
        document.getElementById('metricsOutput').style.display = 'block';
        document.getElementById('metricsTableContainer').style.display = 'none';
        showTableBtn.style.display = 'none';
        return;
    }

    const rawData = {};
    filteredMap.forEach((value, key) => {
        rawData[key] = {
            risk: value.data.map(d => d.x),
            profit: value.data.map(d => d.y)
        };
    });

    const combinedFrontData = combineNonDominatedSets(filteredMap);
    rawData["Combined Front"] = {
        risk: combinedFrontData.risk,
        profit: combinedFrontData.profit
    };

    const normalized = normalize(rawData);

    try {
        const HV = calcHV(normalized);
        const GD = calcGD(normalized, "Combined Front");
        const IGD = calcIGD(normalized, "Combined Front");
        const hitRateResult = calculateHitRate(normalized);
        const hitRate = hitRateResult.percentages;

        let output = '';
        for (const name of Object.keys(normalized)) {
            if (name === "Combined Front") {
                continue;
            }
            const hv = HV[name].toFixed(4);
            const gd = formatScientific(GD[name], 2);
            const igd = formatScientific(IGD[name], 2);
            const hv_value = HV[name].toFixed(20);
            const gd_value = GD[name].toFixed(20);
            const igd_value = IGD[name].toFixed(20);
            const displayName = filteredMap.get(name)?.simplifiedName || name;
            output += `${displayName}\nHV:  ${hv} (${hv_value})\nGD:  ${gd} (${gd_value})\nIGD: ${igd} (${igd_value})\n\n`;
        }

        const panel = document.getElementById('metricsOutput');
        panel.textContent = output.trim();
        panel.style.display = 'block';
        showTableBtn.style.display = 'inline-block';
        combinedFront = combinedFrontData;
        document.getElementById('metricsTableContainer').style.display = 'none';
    } catch (e) {
        console.error("Error calculating metrics:", e);
        document.getElementById('metricsOutput').textContent = "Error calculating metrics: " + e.message;
        document.getElementById('metricsOutput').style.display = 'block';
        showTableBtn.style.display = 'none';
        document.getElementById('metricsTableContainer').style.display = 'none';
    }
}

function generateMetricsTable() {
    if (!datasetMap || datasetMap.size < 2) {
        alert('請至少上傳兩個前緣檔案以顯示指標表格！');
        return;
    }
    if (!checkAllNames()) {
        alert('請先為所有前緣輸入名稱！');
        return;
    }

    const minRisk = parseFloat(minRiskInput.value);
    const maxRisk = parseFloat(maxRiskInput.value);
    const minProfit = parseFloat(minProfitInput.value);
    const maxProfit = parseFloat(maxProfitInput.value);

    const filteredMap = filterDataByRange(datasetMap, minRisk, maxRisk, minProfit, maxProfit);

    if (filteredMap.size < 2) {
        alert('設定的風險報酬範圍沒有解，確認放大區域數值範圍');
        return;
    }

    const rawData = {};
    filteredMap.forEach((value, key) => {
        rawData[key] = {
            risk: value.data.map(d => d.x),
            profit: value.data.map(d => d.y)
        };
    });

    const combinedFrontData = combineNonDominatedSets(filteredMap);
    rawData["Combined Front"] = {
        risk: combinedFrontData.risk,
        profit: combinedFrontData.profit
    };

    const normalized = normalize(rawData);
    const HV = calcHV(normalized);
    const GD = calcGD(normalized, "Combined Front");
    const IGD = calcIGD(normalized, "Combined Front");
    const hitRateResult = calculateHitRate(normalized);
    const hitRate = hitRateResult.percentages;
    const hitCounts = hitRateResult.counts;

    const combinedHV = HV["Combined Front"];
    const HVR = {};
    for (const name in HV) {
        HVR[name] = combinedHV > 0 ? (HV[name] / combinedHV) * 100 : 0;
    }

    const tableBody = document.getElementById('metricsTable').querySelector('tbody');
    tableBody.innerHTML = '';

    const metricsData = [];
    let combinedFrontMetrics = null;
    for (const name in normalized) {
        const pointCount = name === "Combined Front" ?
            combinedFrontData.risk.length :
            filteredMap.get(name)?.data.length || 0;
        const data = {
            fileName: name,
            customName: name === "Combined Front" ? "Combined" : filteredMap.get(name)?.name || name,
            points: pointCount,
            hv: HV[name],
            gd: GD[name],
            igd: IGD[name],
            hvRate: HVR[name],
            hitRate: hitRate[name]
        };
        if (name === "Combined Front") {
            combinedFrontMetrics = data;
        } else {
            metricsData.push(data);
        }
    }

    metricsData.sort((a, b) => a.customName.localeCompare(b.customName));

    const maxNDS = metricsData.length > 0 ? Math.max(...metricsData.map(d => d.points)) : 0;
    const maxHV = metricsData.length > 0 ? Math.max(...metricsData.map(d => d.hv)) : 0;
    const minGD = metricsData.length > 0 ? Math.min(...metricsData.map(d => d.gd)) : Infinity;
    const minIGD = metricsData.length > 0 ? Math.min(...metricsData.map(d => d.igd)) : Infinity;
    const maxHVRate = metricsData.length > 0 ? Math.max(...metricsData.map(d => d.hvRate)) : 0;
    const maxHitRate = metricsData.length > 0 ? Math.max(...metricsData.map(d => d.hitRate)) : 0;

    metricsData.forEach(data => {
        const hitCount = hitCounts[data.fileName] || { hits: 0, total: 0 };
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.customName}</td>
            <td class="${data.points === maxNDS ? 'best' : ''}">${data.points}</td>
            <td class="${data.hv === maxHV ? 'best' : ''}">${data.hv.toFixed(4)}</td>
            <td class="${data.hvRate === maxHVRate ? 'best' : ''}">${data.hvRate.toFixed(2)}%</td>
            <td class="${data.hitRate === maxHitRate ? 'best' : ''}">
                ${data.hitRate.toFixed(2)}%
                <span style="font-size: 0.7em; vertical-align: middle; font-family: 'Times New Roman', Times, serif;">
                    \\( \\frac{${hitCount.hits}}{${hitCount.total}} \\)
                </span>
            </td>
            <td class="${data.gd === minGD ? 'best' : ''}">${formatScientific(data.gd, 2)}</td>
            <td class="${data.igd === minIGD ? 'best' : ''}">${formatScientific(data.igd, 2)}</td>
        `;
        tableBody.appendChild(row);
    });

    if (combinedFrontMetrics) {
        const hitCount = hitCounts[combinedFrontMetrics.fileName] || { hits: 0, total: 0 };
        const row = document.createElement('tr');
        row.className = 'combined-front';
        row.innerHTML = `
            <td>${combinedFrontMetrics.customName}</td>
            <td>${combinedFrontMetrics.points}</td>
            <td>${combinedFrontMetrics.hv.toFixed(4)}</td>
            <td>${combinedFrontMetrics.hvRate.toFixed(2)}%</td>
            <td>
                ${combinedFrontMetrics.hitRate.toFixed(2)}%
                <span style="font-size: 0.7em; vertical-align: middle;">
                    \\( \\frac{${hitCount.hits}}{${hitCount.total}} \\)
                </span>
            </td>
            <td>${formatScientific(combinedFrontMetrics.gd, 2)}</td>
            <td>${formatScientific(combinedFrontMetrics.igd, 2)}</td>
        `;
        tableBody.appendChild(row);
    }

    document.getElementById('metricsTableContainer').style.display = 'block';
    if (window.MathJax) {
        MathJax.typeset();
    }
}

document.getElementById('showTableBtn').addEventListener('click', generateMetricsTable);

function formatScientific(number, digits) {
    const str = number.toExponential(digits);
    const parts = str.split('e');
    const coefficient = parts[0];
    const exponentNum = parseInt(parts[1], 10);
    const sign = exponentNum >= 0 ? '+' : '-';
    const exponent = sign + Math.abs(exponentNum).toString().padStart(2, '0');
    return `${coefficient}E${exponent}`;
}

let modalCounter = 0;

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
    radiusInput.style.width = '26px';
    radiusInput.style.height = '20px';
    radiusInput.style.fontSize = '14px';
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
        const a = parseFloat(opacityNumber.value) / 100 || 0;
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
                number.value = Math.round(value * 100);
                updatePreview();
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
                slider.value = value / 100;
                number.value = value;
                updatePreview();
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
    nameInput.value = datasetMap.get(fileName).name;

    nameInput.addEventListener('blur', () => {
        datasetMap.get(fileName).name = nameInput.value.trim();
        drawChart();
    });
    nameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            nameInput.blur();
        }
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '刪除';
    delBtn.onclick = () => {
        datasetMap.delete(fileName);
        entry.remove();
        drawChart();
        updateFileCount(); // Add this line to update the file count
    };

    entry.appendChild(colorPreview);
    entry.appendChild(nameInput);
    entry.appendChild(document.createTextNode(datasetMap.get(fileName).simplifiedName));
    entry.appendChild(delBtn);
    container.appendChild(entry);
    document.getElementById('resetColorsBtn').style.display = datasetMap.size > 0 ? 'inline-block' : 'none';
}

function drawChart() {
    const ctx = document.getElementById('riskProfitChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    combinedFront = datasetMap.size >= 2 ? combineNonDominatedSets(datasetMap) : null;
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
    if (combinedFront && combinedFront.risk.length > 0) {
        const combinedData = [];
        for (let i = 0; i < combinedFront.risk.length; i++) {
            combinedData.push({
                x: combinedFront.risk[i],
                y: combinedFront.profit[i]
            });
        }
        datasets.push({
            label: 'Combined Front',
            data: combinedData,
            backgroundColor: '#000000',
            borderColor: '#000000',
            pointRadius: 1,
            hoverRadius: 2, // 確保懸停時點大小不變
            showLine: true,
            fill: false,
            tension: 0,
            borderWidth: 1,
            borderDash: [5, 5],
            dragData: false
        });
    }
    const minX = parseFloat(minRiskInput.value);
    const maxX = parseFloat(maxRiskInput.value);
    const minY = parseFloat(minProfitInput.value);
    const maxY = parseFloat(maxProfitInput.value);
    const xMin = isNaN(minX) ? initialRanges.minRisk : minX;
    const xMax = isNaN(maxX) ? initialRanges.maxRisk : maxX;
    const yMin = isNaN(minY) ? initialRanges.minProfit : minY;
    const yMax = isNaN(maxY) ? initialRanges.maxProfit : maxY;

    // Get selected date and format title
    const selectedDate = document.querySelector('.date-entry.selected');
    let title = 'Comparison of Multiple Algorithms';
    if (selectedDate) {
        const year = selectedDate.dataset.year;
        const month = selectedDate.dataset.month;
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        const monthName = monthNames[parseInt(month, 10) - 1] || 'Unknown';
        title = `Comparison of Multiple Algorithms in ${monthName} ${year}`;
    }
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                    callbacks: {
                        label: function (context) {
                            const label = context.dataset.label;
                            const x = context.parsed.x.toFixed(2);
                            const y = context.parsed.y.toFixed(2);
                            return `${label}: (${x}, ${y})`;
                        }
                    }
                },
                legend: {
                    labels: {
                        font: {
                            family: 'Times New Roman',
                            size: 14,
                            weight: 'bold'
                        },
                        color: '#000000'
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        threshold: 2,
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'xy',
                    }
                },
                dragData: {
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
                }
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
    document.getElementById('chart-container').style.margin = '20px auto';
    document.getElementById('chart-container').addEventListener('dblclick', function () {
        chartInstance.resetZoom();
    });
    calculateMetrics();
    document.getElementById('resetColorsBtn').style.display = datasetMap.size > 0 ? 'inline-block' : 'none';
}