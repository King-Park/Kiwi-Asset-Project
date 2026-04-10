let db = JSON.parse(localStorage.getItem('myAssets')) || { bank: [], stock: [], card: [], rent: [] };
let editInfo = { type: null, index: null };

// 카드 입력 모드 토글 (수정 중 탭 이동 시 초기화 로직 포함)
function toggleCardMode(mode, fromEdit = false) {
    const indBtn = document.getElementById('mode-individual-btn');
    const finBtn = document.getElementById('mode-final-btn');
    const indDiv = document.getElementById('card-individual-entry');
    const finDiv = document.getElementById('card-final-entry');

    // 수동 탭 전환 시 진행 중인 수정 모드 취소
    if (!fromEdit && (editInfo.type === 'card' || editInfo.type === 'card-final')) {
        editInfo = { type: null, index: null };
        document.getElementById('card-btn').innerText = "추가";
        document.getElementById('card-btn').classList.remove('edit-mode');
        const finalBtn = document.getElementById('card-final-btn');
        if(finalBtn) { finalBtn.innerText = "입력"; finalBtn.classList.remove('edit-mode'); }
        clearFields('card');
        document.getElementById('card-final-amount').value = '';
    }

    if (mode === 'individual') {
        indDiv.style.display = 'block';
        finDiv.style.display = 'none';
        indBtn.style.background = 'var(--primary-color)';
        finBtn.style.background = '#999';
    } else {
        indDiv.style.display = 'none';
        finDiv.style.display = 'block';
        indBtn.style.background = '#999';
        finBtn.style.background = 'var(--primary-color)';
    }
}

function getDefaultMonth() {
    const now = new Date();
    const day = now.getDate();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (day <= 13) { month -= 1; if (month === 0) { month = 12; year -= 1; } }
    return `${year}-${String(month).padStart(2, '0')}`;
}

function initInputs() {
    const defaultMonth = getDefaultMonth();
    ['bank', 'stock', 'rent'].forEach(type => {
        const el = document.getElementById(`${type}-month`);
        if (el) el.value = defaultMonth;
    });

    const cardDateEl = document.getElementById('card-date');
    if (cardDateEl) cardDateEl.value = new Date().toISOString().split('T')[0]; 
    const cardFinalMonthEl = document.getElementById('card-final-month');
    if (cardFinalMonthEl) cardFinalMonthEl.value = defaultMonth;
}

function addData(type) {
    let entry = {};
    if (type === 'card') {
        const dateVal = document.getElementById('card-date').value;
        if(!dateVal) return alert("날짜를 선택하세요.");
        entry.date = dateVal;
        entry.month = dateVal.substring(0, 7); 
        entry.name = document.getElementById('card-name').value;
        entry.amount = Number(document.getElementById('card-amount').value);
        entry.cat = document.getElementById('card-cat').value; 
    } else {
        entry.month = document.getElementById(`${type}-month`).value;
        if (type === 'bank') {
            entry.name = document.getElementById('bank-name').value;
            entry.amount = Number(document.getElementById('bank-amount').value);
            entry.note = document.getElementById('bank-note').value;
        } else if (type === 'stock') {
            const count = Number(document.getElementById('stock-count').value);
            const curr = Number(document.getElementById('stock-current').value);
            entry.name = document.getElementById('stock-name').value;
            entry.count = count;
            entry.investment = count * Number(document.getElementById('stock-avg').value);
            entry.currentVal = count * curr;
            entry.currentPrice = curr;
        } else if (type === 'rent') {
            entry.type = document.getElementById('rent-type').value;
            entry.deposit = Number(document.getElementById('rent-deposit').value);
            entry.monthly = Number(document.getElementById('rent-monthly').value);
        }
    }

    if (editInfo.type === type) {
        db[type][editInfo.index] = entry;
        editInfo = { type: null, index: null };
        const btn = document.getElementById(`${type}-btn`);
        btn.innerText = "추가";
        btn.classList.remove('edit-mode');
    } else {
        db[type].push(entry);
    }

    saveAndRender();
    initInputs(); 
    clearFields(type);
}

// [수정됨] 최종 명세서 금액 입력 및 '수정' 기능 지원
function addFinalCardAmount() {
    const month = document.getElementById('card-final-month').value;
    const name = document.getElementById('card-final-name').value;
    const finalAmount = Number(document.getElementById('card-final-amount').value);
    
    if (!month || !name || !finalAmount) return alert("월, 카드사, 최종 금액을 모두 입력하세요.");
    
    const isEdit = (editInfo.type === 'card-final');
    const editIdx = isEdit ? editInfo.index : -1;
    
    // 현재 수정 중인 'not set' 데이터는 제외하고 개별 입력 총합 계산
    const currentSum = db.card
        .filter((item, i) => item.month === month && item.name === name && i !== editIdx)
        .reduce((sum, item) => sum + item.amount, 0);
        
    if (finalAmount <= currentSum) {
        return alert(`입력된 개별 항목 합계(${currentSum.toLocaleString()}원)가 명세서 금액보다 큽니다.`);
    }
    
    const diff = finalAmount - currentSum;
    const entry = {
        date: `${month}-28`,
        month: month,
        name: name,
        amount: diff,
        cat: 'not set'
    };
    
    if (isEdit) {
        db.card[editIdx] = entry;
        editInfo = { type: null, index: null };
        const btn = document.getElementById('card-final-btn');
        btn.innerText = "입력";
        btn.classList.remove('edit-mode');
        alert(`명세서 데이터가 갱신되었습니다. (차액: ${diff.toLocaleString()}원)`);
    } else {
        db.card.push(entry);
        alert(`명세서 차액 ${diff.toLocaleString()}원이 'not set' 분류로 추가되었습니다.`);
    }
    
    document.getElementById('card-final-amount').value = ''; 
    saveAndRender();
}

// [수정됨] 데이터 수정 기능
function editData(type, index) {
    const item = db[type][index];

    if (type === 'card') {
        if (item.cat === 'not set') {
            // 명세서 항목을 수정하는 경우 
            toggleCardMode('final', true);
            editInfo = { type: 'card-final', index };
            
            // 해당 항목을 제외한 개별 합계를 구하여 기존 입력했던 '최종 금액'을 역산하여 보여줌
            const currentSum = db.card
                .filter((el, i) => el.month === item.month && el.name === item.name && i !== index)
                .reduce((sum, el) => sum + el.amount, 0);
            
            document.getElementById('card-final-month').value = item.month;
            document.getElementById('card-final-name').value = item.name;
            document.getElementById('card-final-amount').value = currentSum + item.amount;
            
            const btn = document.getElementById('card-final-btn');
            btn.innerText = "수정 완료";
            btn.classList.add('edit-mode');
        } else {
            // 일반 개별 항목 수정
            toggleCardMode('individual', true);
            editInfo = { type: 'card', index };
            document.getElementById('card-date').value = item.date || item.month + '-01';
            document.getElementById('card-name').value = item.name; 
            document.getElementById('card-amount').value = item.amount;
            document.getElementById('card-cat').value = item.cat;
            
            const btn = document.getElementById('card-btn');
            btn.innerText = "수정 완료";
            btn.classList.add('edit-mode');
        }
    } else {
        // 은행, 주식, 렌트 등 기존 수정 로직
        editInfo = { type, index };
        document.getElementById(`${type}-month`).value = item.month;
        if (type === 'bank') {
            document.getElementById('bank-name').value = item.name;
            document.getElementById('bank-amount').value = item.amount;
            document.getElementById('bank-note').value = item.note;
        } else if (type === 'stock') {
            document.getElementById('stock-name').value = item.name;
            document.getElementById('stock-count').value = item.count;
            document.getElementById('stock-avg').value = item.investment / item.count;
            document.getElementById('stock-current').value = item.currentPrice;
        } else if (type === 'rent') {
            document.getElementById('rent-type').value = item.type;
            document.getElementById('rent-deposit').value = item.deposit;
            document.getElementById('rent-monthly').value = item.monthly;
        }
        const btn = document.getElementById(`${type}-btn`);
        btn.innerText = "수정 완료";
        btn.classList.add('edit-mode');
    }
    window.scrollTo(0, 0);
}

function deleteData(type, index) {
    if(confirm("정말 삭제하시겠습니까?")) {
        db[type].splice(index, 1);
        saveAndRender();
    }
}

function saveAndRender() {
    localStorage.setItem('myAssets', JSON.stringify(db));
    renderTables();
    updateDashboard();
}

function clearFields(type) {
    const inputs = document.querySelectorAll(`#${type} input:not([type="month"]):not([type="date"])`);
    inputs.forEach(i => i.value = '');
}

// [수정됨] 테이블 렌더링 - 삭제 버튼 텍스트 '삭제'로 변경
function renderTables() {
    const types = ['bank', 'card', 'rent', 'stock'];
    types.forEach(type => {
        const tbody = document.querySelector(`#${type}-table tbody`);
        if(!tbody) return;
        tbody.innerHTML = '';
        db[type].forEach((item, index) => {
            let row = `<tr>`;
            if (type === 'card') {
                const displayDate = item.date ? item.date : item.month; 
                row += `<td>${displayDate}</td><td>${item.name || ''}</td><td>${item.amount.toLocaleString()}</td><td><span style="color:${item.cat==='not set'?'#dc2626':'inherit'};">${item.cat}</span></td>`;
            } else {
                row += `<td>${item.month}</td>`;
                if(type === 'bank') row += `<td>${item.name}</td><td>${item.amount.toLocaleString()}</td><td>${item.note}</td>`;
                if(type === 'stock') row += `<td>${item.name}</td><td>${item.count}</td><td>${item.investment.toLocaleString()}</td><td>${item.currentVal.toLocaleString()}</td><td>${(item.currentVal - item.investment).toLocaleString()}</td>`;
                if(type === 'rent') row += `<td>${item.type}</td><td>${item.deposit.toLocaleString()}</td><td>${item.monthly.toLocaleString()}</td>`;
            }
            
            // 삭제 버튼 텍스트 수정 (X -> 삭제)
            row += `<td>
                <button class="btn-edit" onclick="editData('${type}', ${index})">수정</button>
                <button class="btn-delete" onclick="deleteData('${type}', ${index})">삭제</button>
            </td></tr>`;
            tbody.innerHTML += row;
        });
    });
    renderStockSummary();
    renderCardSummary();
}

function renderCardSummary() {
    const summaryBody = document.querySelector('#card-summary-table tbody');
    if(!summaryBody) return;
    summaryBody.innerHTML = '';
    
    const grouped = db.card.reduce((acc, curr) => {
        const cardName = curr.name || '미분류';
        if (!acc[cardName]) acc[cardName] = { total: 0, cats: {} };
        
        acc[cardName].total += curr.amount;
        if (!acc[cardName].cats[curr.cat]) acc[cardName].cats[curr.cat] = 0;
        acc[cardName].cats[curr.cat] += curr.amount;
        
        return acc;
    }, {});

    for (let name in grouped) {
        const data = grouped[name];
        
        let catStr = Object.entries(data.cats).map(([cat, amount]) => {
            const percent = ((amount / data.total) * 100).toFixed(1);
            const color = cat === 'not set' ? '#dc2626' : 'inherit'; 
            return `<span style="display:inline-block; margin-right:10px; color:${color};"><b>${cat}</b>: ${amount.toLocaleString()}원 (${percent}%)</span>`;
        }).join('<br>');
        
        summaryBody.innerHTML += `
            <tr>
                <td><strong>${name}</strong></td>
                <td><span class="highlight-red">${data.total.toLocaleString()}원</span></td>
                <td style="font-size:13px; line-height:1.6;">${catStr}</td>
            </tr>`;
    }
}

function renderStockSummary() {
    const summaryBody = document.querySelector('#stock-summary-table tbody');
    if(!summaryBody) return;
    summaryBody.innerHTML = '';
    
    const grouped = db.stock.reduce((acc, curr) => {
        if (!acc[curr.name]) acc[curr.name] = { totalCount: 0, totalInv: 0, totalVal: 0, currPrice: curr.currentPrice };
        acc[curr.name].totalCount += curr.count;
        acc[curr.name].totalInv += curr.investment;
        acc[curr.name].totalVal += (curr.count * curr.currentPrice);
        return acc;
    }, {});

    for (let name in grouped) {
        const data = grouped[name];
        const avgPrice = data.totalInv / data.totalCount;
        const profit = data.totalVal - data.totalInv;
        summaryBody.innerHTML += `
            <tr>
                <td><strong>${name}</strong></td>
                <td>${data.totalCount.toLocaleString()}</td>
                <td>${Math.round(avgPrice).toLocaleString()}원</td>
                <td>${data.totalInv.toLocaleString()}원</td>
                <td>${data.totalVal.toLocaleString()}원</td>
                <td style="color:${profit >= 0 ? '#2563eb' : '#dc2626'}">${profit.toLocaleString()}원</td>
            </tr>`;
    }
}

function updateDashboard() {
    const bankTotal = db.bank.reduce((sum, i) => sum + i.amount, 0);
    const stockInvTotal = db.stock.reduce((sum, i) => sum + i.investment, 0);
    const stockCurrTotal = db.stock.reduce((sum, i) => sum + i.currentVal, 0);
    const cardTotal = db.card.reduce((sum, i) => sum + i.amount, 0);
    const rentTotal = db.rent.reduce((sum, i) => sum + i.deposit, 0);
    
    const totalAssets = bankTotal + stockCurrTotal + rentTotal - cardTotal;
    const totalSaving = bankTotal + stockInvTotal; 

    document.getElementById('total-assets').innerText = totalAssets.toLocaleString() + "원";
    document.getElementById('cur-save').innerText = totalSaving.toLocaleString() + "원";
    document.getElementById('cur-spend').innerText = cardTotal.toLocaleString() + "원";
    document.getElementById('avg-save').innerText = totalSaving.toLocaleString() + "원";
    document.getElementById('avg-spend').innerText = cardTotal.toLocaleString() + "원";

    const pieChart = document.getElementById('asset-pie-chart');
    const legend = document.getElementById('ratio-legend');
    const totalForBar = bankTotal + stockCurrTotal + rentTotal;
    
    legend.innerHTML = '';
    
    // 원형 차트(CSS conic-gradient) 생성 로직
    if(totalForBar > 0) {
        const segments = [
            { label: '은행', val: bankTotal, color: '#4a90e2' },
            { label: '주식', val: stockCurrTotal, color: '#48c774' },
            { label: '보증금', val: rentTotal, color: '#ffdd57' }
        ];

        let gradientStr = [];
        let cumulativePercent = 0;

        segments.forEach(seg => {
            const p = (seg.val / totalForBar * 100);
            if(p > 0) {
                gradientStr.push(`${seg.color} ${cumulativePercent}% ${cumulativePercent + p}%`);
                cumulativePercent += p;
                legend.innerHTML += `<span><b style="color:${seg.color}">●</b> ${seg.label} ${p.toFixed(1)}%</span>`;
            }
        });
        
        // 조각(비율)들을 모아 원형 그라데이션 적용
        pieChart.style.background = `conic-gradient(${gradientStr.join(', ')})`;
    } else {
        pieChart.style.background = '#eee';
    }
}

window.onload = () => { initInputs(); renderTables(); updateDashboard(); };
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if(pageId === 'dashboard') updateDashboard();
}