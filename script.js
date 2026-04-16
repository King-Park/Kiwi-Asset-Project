import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. 본인의 Firebase Config 정보를 여기에 붙여넣으세요 ---
const firebaseConfig = {
  apiKey: "AIzaSyBxUJwgACeYfiY1s1skng0UZuvURo7R3CQ",
  authDomain: "project-dnn.firebaseapp.com",
  projectId: "project-dnn",
  storageBucket: "project-dnn.firebasestorage.app",
  messagingSenderId: "595279356896",
  appId: "1:595279356896:web:45d97c3f695359bdbc4185"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let currentDbData = { bank: [], stock: [], card: [], rent: [] };
let editInfo = { type: null, id: null };

// --- 2. 로그인/로그아웃 처리 ---
document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => { if(confirm("로그아웃 하시겠습니까?")) signOut(auth); };

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('main-nav').style.display = 'flex';
        initInputs();
        syncData(); // 실시간 데이터 연결
    } else {
        currentUser = null;
        document.getElementById('auth-overlay').style.display = 'block';
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('main-nav').style.display = 'none';
    }
});

// --- 3. 실시간 데이터 동기화 (onSnapshot) ---
function syncData() {
    ['bank', 'stock', 'card', 'rent'].forEach(type => {
        const q = query(collection(db, type), where("uid", "==", currentUser.uid));
        onSnapshot(q, (snapshot) => {
            currentDbData[type] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTables();
            updateDashboard();
        });
    });
}

// --- 4. 데이터 추가 및 수정 ---
window.handleAddData = async function(type) {
    let entry = { uid: currentUser.uid, createdAt: new Date() };
    
    if (type === 'card') {
        const dateVal = document.getElementById('card-date').value;
        entry.date = dateVal; entry.month = dateVal.substring(0, 7);
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
            entry.name = document.getElementById('stock-name').value; entry.count = count;
            entry.investment = count * Number(document.getElementById('stock-avg').value);
            entry.currentVal = count * curr; entry.currentPrice = curr;
        } else if (type === 'rent') {
            entry.type = document.getElementById('rent-type').value;
            entry.deposit = Number(document.getElementById('rent-deposit').value);
            entry.monthly = Number(document.getElementById('rent-monthly').value);
        }
    }

    if (editInfo.type === type) {
        await updateDoc(doc(db, type, editInfo.id), entry);
        editInfo = { type: null, id: null };
        document.getElementById(`${type}-btn`).innerText = "추가";
    } else {
        await addDoc(collection(db, type), entry);
    }
    clearFields(type);
};

window.addFinalCardAmount = async function() {
    const month = document.getElementById('card-final-month').value;
    const name = document.getElementById('card-final-name').value;
    const finalAmount = Number(document.getElementById('card-final-amount').value);
    const currentSum = currentDbData.card.filter(i => i.month === month && i.name === name && i.cat !== 'not set').reduce((s, i) => s + i.amount, 0);
    if (finalAmount <= currentSum) return alert("이미 합계가 더 큽니다.");
    await addDoc(collection(db, "card"), { uid: currentUser.uid, month, name, amount: finalAmount - currentSum, cat: 'not set', date: `${month}-28` });
};

window.deleteData = async function(type, id) { if(confirm("정말 삭제하시겠습니까?")) await deleteDoc(doc(db, type, id)); };

window.editData = function(type, id) {
    const item = currentDbData[type].find(el => el.id === id);
    editInfo = { type, id };
    if(type === 'card') {
        toggleCardMode(item.cat === 'not set' ? 'final' : 'individual');
        if(item.cat === 'not set') {
            document.getElementById('card-final-month').value = item.month;
            document.getElementById('card-final-name').value = item.name;
            const curSum = currentDbData.card.filter(i => i.month === item.month && i.name === item.name && i.id !== id).reduce((s, i) => s + i.amount, 0);
            document.getElementById('card-final-amount').value = curSum + item.amount;
            document.getElementById('card-final-btn').innerText = "수정 완료";
        } else {
            document.getElementById('card-date').value = item.date; document.getElementById('card-name').value = item.name;
            document.getElementById('card-amount').value = item.amount; document.getElementById('card-cat').value = item.cat;
            document.getElementById('card-btn').innerText = "수정 완료";
        }
    } else {
        document.getElementById(`${type}-month`).value = item.month;
        if(type==='bank'){ document.getElementById('bank-name').value=item.name; document.getElementById('bank-amount').value=item.amount; document.getElementById('bank-note').value=item.note; }
        document.getElementById(`${type}-btn`).innerText = "수정 완료";
    }
};

function renderTables() {
    ['bank', 'card', 'rent', 'stock'].forEach(type => {
        const tbody = document.querySelector(`#${type}-table tbody`);
        if(!tbody) return; tbody.innerHTML = '';
        currentDbData[type].sort((a,b) => b.month.localeCompare(a.month)).forEach((item) => {
            let row = `<tr><td>🧾</td><td>${item.name || item.type}</td><td>${item.amount?.toLocaleString() || item.deposit?.toLocaleString()}원</td></tr>`;
            if (type === 'card') row = `<tr><td>🧾</td><td><b>${item.name}</b><br><small>${item.date} • ${item.cat}</small></td><td style="text-align:right"><b>${item.amount.toLocaleString()}원</b><br><button class="btn-edit" onclick="editData('card', '${item.id}')">수정</button> <button class="btn-delete" onclick="deleteData('card', '${item.id}')">삭제</button></td></tr>`;
            else row = `<tr><td>🧾</td><td><b>${item.name || item.type}</b><br><small>${item.month}</small></td><td style="text-align:right"><b>${(item.amount || item.deposit).toLocaleString()}원</b><br><button class="btn-edit" onclick="editData('${type}', '${item.id}')">수정</button> <button class="btn-delete" onclick="deleteData('${type}', '${item.id}')">삭제</button></td></tr>`;
            tbody.innerHTML += row;
        });
    });
    renderStockSummary(); renderCardSummary();
}

// 대시보드 도넛 차트 및 요약 로직
function updateDashboard() {
    const bankTotal = currentDbData.bank.reduce((sum, i) => sum + i.amount, 0);
    const stockCurrTotal = currentDbData.stock.reduce((sum, i) => sum + i.currentVal, 0);
    const cardTotal = currentDbData.card.reduce((sum, i) => sum + i.amount, 0);
    const rentTotal = currentDbData.rent.reduce((sum, i) => sum + i.deposit, 0);
    const totalAssets = bankTotal + stockCurrTotal + rentTotal - cardTotal;
    
    document.getElementById('total-assets').innerText = totalAssets.toLocaleString() + "원";
    document.getElementById('cur-save').innerText = (bankTotal + stockCurrTotal).toLocaleString() + "원";

    const pieChart = document.getElementById('asset-donut-chart');
    const legend = document.getElementById('donut-legend');
    const total = bankTotal + stockCurrTotal + rentTotal;
    if(total > 0) {
        const segs = [
            { label: '국내/외 주식', val: stockCurrTotal, color: '#1A3636' },
            { label: '안전 예치금', val: bankTotal, color: '#C3F400' },
            { label: '기타 자산', val: rentTotal, color: '#5E7171' }
        ];
        let cum = 0; let grad = [];
        legend.innerHTML = '';
        segs.forEach(s => {
            const p = (s.val / total * 100);
            if(p > 0) {
                grad.push(`${s.color} ${cum}% ${cum + p}%`); cum += p;
                legend.innerHTML += `<div class="legend-item"><div class="legend-left"><div class="legend-dot" style="background:${s.color}"></div>${s.label}</div><div class="legend-right">${p.toFixed(0)}%</div></div>`;
            }
        });
        pieChart.style.background = `conic-gradient(${grad.join(', ')})`;
    }
}

// 공통 유틸
window.showPage = (id) => { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(id).classList.add('active'); };
window.toggleCardMode = (mode) => { 
    document.getElementById('card-individual-entry').style.display = mode === 'individual' ? 'grid' : 'none'; 
    document.getElementById('card-final-entry').style.display = mode === 'final' ? 'grid' : 'none';
    document.getElementById('mode-individual-btn').className = mode === 'individual' ? 'active-toggle' : '';
    document.getElementById('mode-final-btn').className = mode === 'final' ? 'active-toggle' : '';
};
function initInputs() {
    document.querySelectorAll('input[type="month"]').forEach(i => i.value = new Date().toISOString().substring(0,7));
    document.querySelectorAll('input[type="date"]').forEach(i => i.value = new Date().toISOString().substring(0,10));
}
function clearFields(type) { document.querySelectorAll(`#${type} input:not([type="month"]):not([type="date"])`).forEach(i => i.value = ''); }
function renderStockSummary() {} function renderCardSummary() {} // 요약 로직 필요시 추가