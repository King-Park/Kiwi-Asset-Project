import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc, getDocs, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let activeListeners = []; //메모리 누수 방지를 위한 구독 해제 함수 보관 배열

// --- 샘플 데이터 정의 ---
const sampleData = {
    bank: [{ name: "샘플은행", amount: 5000000, month: "2024-05", note: "예시 데이터" }],
    stock: [{ name: "삼성전자", count: 10, investment: 700000, currentVal: 850000, month: "2024-05" }],
    card: [{ name: "현대카드", amount: 150000, date: "2024-05-01", cat: "식비", month: "2024-05" }],
    rent: [{ type: "전세", deposit: 100000000, monthly: 0, month: "2024-05" }]
};

// 구독 해제 실행 함수 추가
function clearAllListeners() {
    activeListeners.forEach(unsub => unsub()); // 보관된 모든 구독 해제 함수 실행
    activeListeners = []; // 배열 초기화
}

// --- 2. 로그인/로그아웃 처리 ---
// 로그인 버튼 함수를 전역으로 노출
window.handleGoogleLogin = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => { if(confirm("로그아웃 하시겠습니까?")) signOut(auth); };

onAuthStateChanged(auth, (user) => {
    const userDisplay = document.getElementById('user-display');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const overlay = document.getElementById('login-needed-banner');
    const nav = document.getElementById('main-nav');

    if (user) {
        // 1. 로그인 성공 시
        currentUser = user;
        userDisplay.innerText = user.email.split('@')[0].toUpperCase(); // ID 표시
        document.getElementById('settings-id').innerText = user.email.split('@')[0];
        document.getElementById('settings-email').innerText = user.email;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        overlay.style.display = 'none'; // 배너 숨기기
        nav.style.display = 'flex';     // 메뉴 보이기
        syncData(); 
    } else {
        // 2. 로그아웃 또는 비로그인 시
        currentUser = null;

        clearAllListeners(); //로그아웃 시 백그라운드 데이터 수신을 완벽히 차단 (메모리 누수 방지)

        userDisplay.innerText = "GUEST MODE";
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        overlay.style.display = 'flex'; // 배너 보이기 (GUEST 모드)
        nav.style.display = 'none';      // 메뉴 숨기기
        
        // 샘플 데이터 연결
        currentDbData = JSON.parse(JSON.stringify(sampleData)); 
        renderTables();
        updateDashboard();
    }
});

// --- 3. 실시간 데이터 동기화 (onSnapshot) ---
function syncData() {
    // 중복 실행 방지를 위해 기존 리스너가 있다면 먼저 모두 초기화
    clearAllListeners(); 

    ['bank', 'stock', 'card', 'rent'].forEach(type => {
        // 쿼리 최적화: 내 데이터 중 최신 100개만 가져오도록 제한 (과금 폭탄 방지)
        const q = query(
            collection(db, type), 
            where("uid", "==", currentUser.uid),
            orderBy("createdAt", "desc"), 
            limit(100) 
        );
        
        // onSnapshot이 반환하는 구독 해제(unsubscribe) 함수를 변수에 담음
        const unsubscribe = onSnapshot(q, (snapshot) => {
            currentDbData[type] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTables();
            updateDashboard();
        });

        // 반환된 구독 해제 함수를 배열에 저장 (추후 clearAllListeners에서 사용)
        activeListeners.push(unsubscribe);
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
    
    // 기존에 개별 등록된 지출의 합계 계산
    const currentSum = currentDbData.card.filter(i => i.month === month && i.name === name && i.cat !== 'not set').reduce((s, i) => s + i.amount, 0);
    
    if (finalAmount <= currentSum) {
        return alert("이미 등록된 개별 지출의 합계가 명세서 총액보다 큽니다.");
    }

    // ✅ 수정 모드일 때의 로직 추가
    if (editInfo.type === 'card' && editInfo.id) {
        await updateDoc(doc(db, "card", editInfo.id), {
            month,
            name,
            amount: finalAmount - currentSum,
            date: `${month}-28`
            // 수정 시에는 기존 createdAt을 유지합니다.
        });
        
        editInfo = { type: null, id: null }; // 수정 정보 초기화
        document.getElementById('card-final-btn').innerText = "명세서 추가"; // 버튼 이름 원복
        alert("명세서 내역이 수정되었습니다.");
        
    } else {
        // ✅ 신규 추가 로직 (createdAt 필드 추가)
        await addDoc(collection(db, "card"), { 
            uid: currentUser.uid, 
            month, 
            name, 
            amount: finalAmount - currentSum, 
            cat: 'not set', 
            date: `${month}-28`,
            createdAt: new Date() // ⭐️ 핵심 해결책: 생성일자 데이터 포함
        });
        alert("명세서 차액이 성공적으로 등록되었습니다.");
    }

    // ✅ UI 피드백: 처리 완료 후 금액 입력칸 비우기
    document.getElementById('card-final-amount').value = '';
};

/* 기존 명세서 함수
window.addFinalCardAmount = async function() {
    const month = document.getElementById('card-final-month').value;
    const name = document.getElementById('card-final-name').value;
    const finalAmount = Number(document.getElementById('card-final-amount').value);
    const currentSum = currentDbData.card.filter(i => i.month === month && i.name === name && i.cat !== 'not set').reduce((s, i) => s + i.amount, 0);
    if (finalAmount <= currentSum) return alert("이미 합계가 더 큽니다.");
    await addDoc(collection(db, "card"), { uid: currentUser.uid, month, name, amount: finalAmount - currentSum, cat: 'not set', date: `${month}-28` });
}; */

window.deleteData = async function(type, id) { if(confirm("정말 삭제하시겠습니까?")) await deleteDoc(doc(db, type, id)); };

// --- 데이터 수정 (폼에 기존 데이터 불러오기) ---
window.editData = function(type, id) {
    const item = currentDbData[type].find(el => el.id === id);
    editInfo = { type, id };
    
    if (type === 'card') {
        toggleCardMode(item.cat === 'not set' ? 'final' : 'individual');
        if (item.cat === 'not set') {
            document.getElementById('card-final-month').value = item.month;
            document.getElementById('card-final-name').value = item.name;
            const curSum = currentDbData.card.filter(i => i.month === item.month && i.name === item.name && i.id !== id).reduce((s, i) => s + i.amount, 0);
            document.getElementById('card-final-amount').value = curSum + item.amount;
            document.getElementById('card-final-btn').innerText = "수정 완료";
        } else {
            document.getElementById('card-date').value = item.date; 
            document.getElementById('card-name').value = item.name;
            document.getElementById('card-amount').value = item.amount; 
            document.getElementById('card-cat').value = item.cat;
            document.getElementById('card-btn').innerText = "수정 완료";
        }
    } else {
        // 공통: 월(Month) 데이터 채우기
        document.getElementById(`${type}-month`).value = item.month;
        
        // ✅ 누락되었던 주식 및 거주지 데이터 불러오기 추가
        if (type === 'bank') { 
            document.getElementById('bank-name').value = item.name; 
            document.getElementById('bank-amount').value = item.amount; 
            document.getElementById('bank-note').value = item.note || ''; 
        } 
        else if (type === 'stock') {
            document.getElementById('stock-name').value = item.name;
            document.getElementById('stock-count').value = item.count;
            
            // DB에 저장된 총 투자금과 현재가치로 평단가와 현재가를 역산하여 폼에 입력
            const avgPrice = item.count > 0 ? (item.investment / item.count) : 0;
            const currentPrice = item.currentPrice || (item.count > 0 ? (item.currentVal / item.count) : 0);
            
            document.getElementById('stock-avg').value = avgPrice;
            document.getElementById('stock-current').value = currentPrice;
        } 
        else if (type === 'rent') {
            document.getElementById('rent-type').value = item.type;
            document.getElementById('rent-deposit').value = item.deposit;
            document.getElementById('rent-monthly').value = item.monthly;
        }
        
        // 저장 버튼을 '수정 완료'로 변경
        document.getElementById(`${type}-btn`).innerText = "수정 완료";
    }
};

/* 기존 데이터 수정 로직
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

*/

/*function renderTables() {
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
*/

// --- 데이터 테이블 렌더링 (오류 방지 적용) ---
function renderTables() {
    ['bank', 'card', 'rent', 'stock'].forEach(type => {
        const tbody = document.querySelector(`#${type}-table tbody`);
        if(!tbody) return; 
        
        tbody.innerHTML = '';
        
        // 데이터 배열이 없거나 비어있으면 건너뜀
        if (!currentDbData[type]) return;

        currentDbData[type].sort((a,b) => (b.month || "").localeCompare(a.month || "")).forEach((item) => {
            let row = '';
            
            if (type === 'card') {
                // 카드 데이터 렌더링 (amount가 없을 경우 0으로 처리)
                const amount = item.amount || 0;
                row = `<tr><td><b>${item.name}</b><br><small>${item.date || item.month} • ${item.cat}</small></td><td style="text-align:right"><b>${amount.toLocaleString()}원</b><br><button class="btn-edit" onclick="editData('card', '${item.id}')">수정</button> <button class="btn-delete" onclick="deleteData('card', '${item.id}')">삭제</button></td></tr>`;
            } else {
                // 은행(amount), 거주(deposit), 주식(currentVal) 필드를 모두 커버하며, 없을 경우 0으로 안전하게 처리
                const displayAmount = item.amount || item.deposit || item.currentVal || item.investment || 0;
                row = `<tr><td><b>${item.name || item.type || '알 수 없음'}</b><br><small>${item.month || '날짜 없음'}</small></td><td style="text-align:right"><b>${displayAmount.toLocaleString()}원</b><br><button class="btn-edit" onclick="editData('${type}', '${item.id}')">수정</button> <button class="btn-delete" onclick="deleteData('${type}', '${item.id}')">삭제</button></td></tr>`;
            }
            tbody.innerHTML += row;
        });
    });
    
    // 요약 테이블 함수 호출 (정의되어 있을 경우)
    if (typeof renderStockSummary === 'function') renderStockSummary(); 
    if (typeof renderCardSummary === 'function') renderCardSummary();
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
// 기존 window.showPage = (id) => { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(id).classList.add('active'); };

window.showPage = (id) => { 
    // 1. 화면 페이지 전환
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); 
    document.getElementById(id).classList.add('active'); 

    // 2. 하단 네비게이션 메뉴 활성화 상태 업데이트
    document.querySelectorAll('#main-nav span').forEach(span => {
        // 클릭된 메뉴의 onclick 속성에 해당 id가 포함되어 있으면 active-nav 클래스 추가
        if (span.getAttribute('onclick') && span.getAttribute('onclick').includes(id)) {
            span.classList.add('active-nav');
        } else {
            span.classList.remove('active-nav');
        }
    });
};

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

// 월별 데이터 일괄 삭제 기능
window.handleMonthlyDelete = async function() {
    const month = document.getElementById('delete-month').value;
    const selectedCats = Array.from(document.querySelectorAll('.delete-cat:checked')).map(cb => cb.value);

    if (!month || selectedCats.length === 0) {
        alert("삭제할 월과 항목을 최소 하나 이상 선택해 주세요.");
        return;
    }

    if (!confirm(`${month} 해당 항목의 모든 데이터를 삭제하시겠습니까?`)) return;

    try {
        for (const type of selectedCats) {
            const q = query(collection(db, type), where("uid", "==", currentUser.uid), where("month", "==", month));
            const querySnapshot = await getDocs(q);
            
            const deletePromises = querySnapshot.docs.map(d => deleteDoc(doc(db, type, d.id)));
            await Promise.all(deletePromises);
        }
        alert("선택하신 데이터가 정상적으로 삭제되었습니다.");
    } catch (error) {
        console.error("Delete Error:", error);
        alert("데이터 삭제 중 오류가 발생했습니다.");
    }
};