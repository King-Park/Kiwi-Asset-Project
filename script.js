import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc, getDocs, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. 본인의 Firebase Config 정보를 여기에 붙여넣으세요 ---
const firebaseConfig = {
  apiKey: "AIzaSyBxUJwgACeYfiY1s1skng0UZuvURo7R3CQ",
  authDomain: "project-dnn.web.app",
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
window.handleGoogleLogin = () => {
    const isLocalhost = window.location.hostname === 'localhost'
                     || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        signInWithPopup(auth, provider);
    } else {
        signInWithRedirect(auth, provider);
    }
};

// ✅ 전역에서 한 번만 실행 — redirect 후 돌아왔을 때 로그인 결과 처리
getRedirectResult(auth).then(result => {
    if (result && result.user) {
        console.log("Redirect 로그인 성공:", result.user.email);
    }
}).catch(error => {
    console.error("Redirect 로그인 실패:", error);
});

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
        clearAllListeners();

        let initialLoadCount = 0;                // 4개 컬렉션 로드 완료 카운터
        const TOTAL_COLLECTIONS = 4;
        let autoUpdateDone = false;              // 중복 실행 방지 플래그

        ['bank', 'stock', 'card', 'rent'].forEach(type => {
            const q = query(
                collection(db, type),
                where("uid", "==", currentUser.uid),
                orderBy("createdAt", "desc"),
                limit(100)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                currentDbData[type] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderTables();
                updateDashboard();

                // 4개 컬렉션이 모두 최초 1회 로드됐을 때만 자동 업데이트 실행
                initialLoadCount++;
                if (initialLoadCount === TOTAL_COLLECTIONS && !autoUpdateDone) {
                    autoUpdateDone = true;
                    checkAfternoonAutoUpdate();
                }
            });

            activeListeners.push(unsubscribe);
        });
    }

// --- 전월 데이터 당월 복사 ---
window.copyPrevMonth = async function(type) {
    if (!currentUser) {
        alert("로그인 후 이용해 주세요.");
        return;
    }

    // 전월 계산
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const nowMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 전월 데이터 조회
    const prevItems = currentDbData[type].filter(i => i.month === prevMonth);

    if (prevItems.length === 0) {
        alert(`${prevMonth} 데이터가 없습니다.`);
        return;
    }

    // 당월에 이미 데이터가 있으면 경고
    const alreadyExists = currentDbData[type].some(i => i.month === nowMonth);
    if (alreadyExists) {
        if (!confirm(`${nowMonth}에 이미 데이터가 있습니다. 전월 데이터를 추가로 복사하시겠습니까?`)) return;
    } else {
        if (!confirm(`${prevMonth} 데이터 ${prevItems.length}건을 ${nowMonth}으로 복사하시겠습니까?`)) return;
    }

    try {
        // 전월 데이터를 당월로 복사하여 일괄 추가
        const copyPromises = prevItems.map(item => {
            // 불필요한 필드 제거 후 당월로 교체
            const { id, createdAt, currentVal, currentPrice, ...rest } = item;

            const newEntry = {
                ...rest,
                uid: currentUser.uid,
                month: nowMonth,
                createdAt: new Date(),
                // 주식의 경우 현재가는 0으로 초기화 (이후 수동 업데이트로 갱신)
                ...(type === 'stock' && { currentVal: 0, currentPrice: 0 })
            };

            return addDoc(collection(db, type), newEntry);
        });

        await Promise.all(copyPromises);
        alert(`${prevItems.length}건이 ${nowMonth}으로 복사되었습니다.${type === 'stock' ? '\n현재가는 [현재가 수동 업데이트] 버튼으로 갱신해 주세요.' : ''}`);

    } catch (error) {
        console.error("복사 오류:", error);
        alert("복사 중 오류가 발생했습니다.");
    }
};

// --- 4. 데이터 추가 및 수정 ---
window.handleAddData = async function(type) {
    //비로그인 상태 방어
    if (!currentUser) {
        alert("로그인 후 이용해 주세요.");
        return;
    }
    let entry = { uid: currentUser.uid, createdAt: new Date() };
    
    if (type === 'card') {
        const dateVal = document.getElementById('card-date').value;
        entry.date = dateVal; entry.month = dateVal.substring(0, 7);
        entry.name = document.getElementById('card-name').value;
        entry.amount = Number(document.getElementById('card-amount').value);
        entry.cat = document.getElementById('card-cat').value;
        entry.isPublic = document.getElementById('card-isPublic').checked;
    } else {
        entry.month = document.getElementById(`${type}-month`).value;
        entry.isPublic = document.getElementById(`${type}-isPublic`).checked;
        if (type === 'bank') {
            entry.name = document.getElementById('bank-name').value;
            entry.amount = Number(document.getElementById('bank-amount').value);
            entry.note = document.getElementById('bank-note').value;
            if (!entry.name || !entry.amount) {
                alert("은행명과 금액을 입력해 주세요."); return;
            }

        } else if (type === 'stock') {
            const count = Number(document.getElementById('stock-count').value);
            const avg = Number(document.getElementById('stock-avg').value);
            const ticker = document.getElementById('stock-ticker').value.trim();
            
            if (!document.getElementById('stock-name').value || !count || !avg) {
                alert("종목명, 수량, 평단가를 모두 입력해 주세요."); return;
            }

            entry.name = document.getElementById('stock-name').value; 
            entry.ticker = ticker; 
            entry.count = count;
            entry.investment = count * avg;
            
            // 추가 시점에 현재가를 1회 긁어와서 저장
            const fetchedPrice = ticker ? await fetchStockPrice(ticker) : 0;
            entry.currentPrice = fetchedPrice;
            entry.currentVal = count * fetchedPrice;

        } else if (type === 'rent') {
            entry.type = document.getElementById('rent-type').value;
            entry.deposit = Number(document.getElementById('rent-deposit').value);
            entry.monthly = Number(document.getElementById('rent-monthly').value);
            
            if (!entry.type || !entry.deposit) {
                alert("유형과 보증금을 입력해 주세요."); return;
            }
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
    const isPaid = document.getElementById('card-final-isPaid').checked;
    const currentSum = currentDbData.card.filter(i => i.month === month && i.name === name && i.cat !== 'not set').reduce((s, i) => s + i.amount, 0);
    
    if (finalAmount <= currentSum) {
        return alert("이미 등록된 개별 지출의 합계가 명세서 총액보다 큽니다.");
    }

    if (editInfo.type === 'card' && editInfo.id) {
        await updateDoc(doc(db, "card", editInfo.id), {
            month,
            name,
            amount: finalAmount - currentSum,
            date: `${month}-28`,
            isPaid, // 수정 시 DB에 상태 업데이트
            isPublic
        });
        
        editInfo = { type: null, id: null }; 
        document.getElementById('card-final-btn').innerText = "명세서 추가"; 
        alert("명세서 내역이 수정되었습니다.");
        
    } else {
        await addDoc(collection(db, "card"), { 
            uid: currentUser.uid, 
            month, 
            name, 
            amount: finalAmount - currentSum, 
            cat: 'not set', 
            date: `${month}-28`,
            createdAt: new Date(),
            isPaid, // 신규 추가 시 DB에 저장
            isPublic
        });
        alert("명세서 차액이 성공적으로 등록되었습니다.");
    }

    // UI 피드백 초기화
    document.getElementById('card-final-amount').value = '';
    document.getElementById('card-final-isPaid').checked = false; // 체크박스 초기화
    document.getElementById('card-final-isPublic').checked = false;
};

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
            document.getElementById('card-final-isPaid').checked = item.isPaid || false;
            document.getElementById('card-final-isPublic').checked = item.isPublic || false; 
            document.getElementById('card-final-btn').innerText = "수정 완료";
        } else {
            document.getElementById('card-date').value = item.date; 
            document.getElementById('card-name').value = item.name;
            document.getElementById('card-amount').value = item.amount; 
            document.getElementById('card-cat').value = item.cat;
            document.getElementById('card-isPublic').checked = item.isPublic || false;
            document.getElementById('card-btn').innerText = "수정 완료";
        }
    } else {
        // 공통: 월(Month) 데이터 채우기
        document.getElementById(`${type}-month`).value = item.month;
        document.getElementById(`${type}-isPublic`).checked = item.isPublic || false;

        // 누락되었던 주식 및 거주지 데이터 불러오기 추가
        if (type === 'bank') { 
            document.getElementById('bank-name').value = item.name; 
            document.getElementById('bank-amount').value = item.amount; 
            document.getElementById('bank-note').value = item.note || ''; 
        } else if (type === 'stock') {
            document.getElementById('stock-name').value = item.name;
            document.getElementById('stock-ticker').value = item.ticker || ''; // 종목코드 불러오기
            document.getElementById('stock-count').value = item.count;
            // 평단가 역산
            const avgPrice = item.count > 0 ? (item.investment / item.count) : 0;
            document.getElementById('stock-avg').value = avgPrice;         
        }else if (type === 'rent') {
            document.getElementById('rent-type').value = item.type;
            document.getElementById('rent-deposit').value = item.deposit;
            document.getElementById('rent-monthly').value = item.monthly;
        }
        
        // 저장 버튼을 '수정 완료'로 변경
        document.getElementById(`${type}-btn`).innerText = "수정 완료";
    }
};

// [전체 교체] script.js의 renderTables 함수
function renderTables() {
    ['bank', 'card', 'rent', 'stock'].forEach(type => {
        const tbody = document.querySelector(`#${type}-table tbody`);
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!currentDbData[type] || currentDbData[type].length === 0) return;

        // 최신순 정렬
        const sorted = [...currentDbData[type]].sort((a, b) => {
            const aMonth = a.month || "";
            const bMonth = b.month || "";
            return bMonth.localeCompare(aMonth);
        });

        sorted.forEach(item => {
            let row = '';
            const amount = item.amount ?? item.currentVal ?? item.deposit ?? 0;
            const dateText = item.date || item.month || '-';
            const noteText = (type === 'bank' && item.note) ? ` • ${item.note}` : '';
            const publicBadge = item.isPublic ? `<span style="color:#3B82F6; font-size:11px; font-weight:800;">[공금]</span> ` : '';

            if (type === 'card') {
                const paidBadge = (item.cat === 'not set' && item.isPaid) ? `[결제완료] ` : '';
                row = `<tr>
                    <td>${dateText} • ${item.cat || '-'}</td>
                    <td><b>${paidBadge}${item.name || '알 수 없음'}</b></td>
                    <td style="text-align:right">
                        <b>${amount.toLocaleString()}원</b><br>
                        <button class="btn-edit" onclick="editData('card', '${item.id}')">수정</button>
                        <button class="btn-delete" onclick="deleteData('card', '${item.id}')">삭제</button>
                    </td>
                </tr>`;
            } else {
                // 비고(noteText)를 첫 번째 <td>에 넣어 날짜 스타일(12px, 회색)을 그대로 적용
                row = `<tr>
                    <td>${dateText}${noteText}</td>
                    <td><b>${publicBadge}${item.name || item.type || '알 수 없음'}</b></td>
                    <td style="text-align:right">
                        <b>${amount.toLocaleString()}원</b><br>
                        <button class="btn-edit" onclick="editData('${type}', '${item.id}')">수정</button>
                        <button class="btn-delete" onclick="deleteData('${type}', '${item.id}')">삭제</button>
                    </td>
                </tr>`;
            }
            tbody.innerHTML += row;
        });
    });
}


// [전체 교체] script.js의 updateDashboard 함수
function updateDashboard() {
    const now = new Date();
    const nowMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // --- 1. 데이터 분류 (개인 vs 공금) ---
    const bankP = currentDbData.bank.filter(i => !i.isPublic);
    const bankPb = currentDbData.bank.filter(i => i.isPublic);
    const stockP = currentDbData.stock.filter(i => !i.isPublic);
    const stockPb = currentDbData.stock.filter(i => i.isPublic);
    const rentP = currentDbData.rent.filter(i => !i.isPublic);
    const rentPb = currentDbData.rent.filter(i => i.isPublic);

    // --- 2. 상단 요약 박스 계산 (개인 자산 기준) ---
    // 수정: 당월 데이터만 필터링하여 합산
    const bankTotalP  = bankP.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.amount, 0);
    const stockTotalP = stockP.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.currentVal, 0);
    const rentTotalP  = rentP.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.deposit, 0);
    
    const paidCardSigs = currentDbData.card.filter(i => i.cat === 'not set' && i.isPaid).map(i => `${i.month}_${i.name}`);
    const cardTotalP = currentDbData.card
        .filter(i => i.month === nowMonth && !i.isPublic)
        .filter(i => !paidCardSigs.includes(`${i.month}_${i.name}`))
        .reduce((sum, i) => sum + i.amount, 0);

    const totalAssetsP = bankTotalP + stockTotalP + rentTotalP - cardTotalP;

    // (저축액 계산용 지난달 데이터 - 생략, 기존 로직 유지)
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const prevBankP  = bankP.filter(i => i.month === prevMonth).reduce((s, i) => s + i.amount, 0);
    const prevStockP = stockP.filter(i => i.month === prevMonth).reduce((s, i) => s + i.currentVal, 0);
    const prevRentP  = rentP.filter(i => i.month === prevMonth).reduce((s, i) => s + i.deposit, 0);
    const prevCardP  = currentDbData.card
        .filter(i => i.month === prevMonth && !i.isPublic)
        .filter(i => !paidCardSigs.includes(`${i.month}_${i.name}`))
        .reduce((s, i) => s + i.amount, 0);
    const prevTotalAssetsP = prevBankP + prevStockP + prevRentP - prevCardP;
    const monthlySaving = totalAssetsP - prevTotalAssetsP;
    const monthlyRentP = rentP
        .filter(i => i.month === nowMonth)
        .reduce((s, i) => s + (i.monthly ?? 0), 0);

    const monthlySpendingP = currentDbData.card
        .filter(i => i.month === nowMonth && !i.isPublic)
        .reduce((s, i) => s + i.amount, 0)
        + monthlyRentP;

// --- 3. UI 요약박스 업데이트 ---
    
    // ① 총 순자산 (만원 단위 + 원본 소수점 제거)
    const manwonAssets = Math.trunc(totalAssetsP / 10000).toLocaleString();
    document.getElementById('total-assets').innerHTML = 
        `${manwonAssets}만원 <br>
         <span style="font-size: 14px; font-weight: normal; color: var(--text-muted); margin-top: 4px; display: inline-block;">
            (${Math.round(totalAssetsP).toLocaleString()}원)
         </span>`;

    // ② 이번 달 총 지출 (만원 단위 + 원본 소수점 제거)
    const manwonSpending = Math.trunc(monthlySpendingP / 10000).toLocaleString();
    document.getElementById('cur-spending').innerHTML = 
        `${manwonSpending}만원 <br>
         <span style="font-size: 14px; font-weight: normal; color: var(--text-muted); margin-top: 4px; display: inline-block;">
            (${Math.round(monthlySpendingP).toLocaleString()}원)
         </span>`;

    // ③ 전월 변동금액 비교 (만원 단위 + 원본 소수점 제거 + 색상 처리)
    const saveEl = document.getElementById('cur-save');
    let changeTextManwon = "0만원";
    let changeTextWon = "(0원)";
    let changeColor = "var(--text-color)"; // 변동 없을 시 기본 텍스트 색상

    if (monthlySaving > 0) {
        changeTextManwon = `+ ${Math.trunc(monthlySaving / 10000).toLocaleString()}만원`;
        changeTextWon = `(+ ${Math.round(monthlySaving).toLocaleString()}원)`;
        changeColor = "#EF4444"; // 상승 시 붉은색
    } else if (monthlySaving < 0) {
        changeTextManwon = `- ${Math.trunc(Math.abs(monthlySaving) / 10000).toLocaleString()}만원`;
        changeTextWon = `(- ${Math.round(Math.abs(monthlySaving)).toLocaleString()}원)`;
        changeColor = "#3B82F6"; // 하락 시 파란색
    }

    // 폰트 색상과 굵기를 적용하여 HTML 삽입
    saveEl.innerHTML = `
        <span style="color: ${changeColor}; font-weight: bold;">${changeTextManwon}</span> <br>
        <span style="font-size: 14px; font-weight: normal; color: var(--text-muted); margin-top: 4px; display: inline-block;">
            ${changeTextWon}
        </span>`;

    // --- 4. 차트 렌더링 함수 (재사용 로직) ---
    function drawChart(chartId, legendId, data) {
        const chart = document.getElementById(chartId);
        const legend = document.getElementById(legendId);
        const total = data.reduce((sum, s) => sum + s.val, 0);
        
        if (total > 0) {
            let cum = 0; let grad = [];
            legend.innerHTML = '';
            data.forEach(s => {
                const p = (s.val / total * 100);
                if (p > 0) {
                    grad.push(`${s.color} ${cum}% ${cum + p}%`);
                    cum += p;
                    legend.innerHTML += `
                    <div class="legend-item">
                        <div class="legend-left">
                            <div class="legend-dot" style="background:${s.color}"></div>
                            ${s.label}
                        </div>
                        <div class="legend-right">
                            ${p.toFixed(0)}% <span style="font-size: 11px; font-weight: normal; color: var(--text-muted); margin-left: 4px;">(${s.val.toLocaleString()}원)</span>
                        </div>
                    </div>`;
                }
            });
            chart.style.background = `conic-gradient(${grad.join(', ')})`;
        }
    }

    // --- 5. 개인 차트 실행 ---
    // 444~448번째 줄 수정: 차트도 당월 기준으로 통일
    const personalData = [
        { label: '국내/외 주식', val: stockP.filter(i => i.month === nowMonth).reduce((s, i) => s + i.currentVal, 0), color: '#1A3636' },
        { label: '예적금',       val: bankP.filter(i => i.month === nowMonth).reduce((s, i) => s + i.amount, 0),      color: '#C3F400' },
        { label: '보증금',       val: rentP.filter(i => i.month === nowMonth).reduce((s, i) => s + i.deposit, 0),     color: '#5E7171' }
    ];
    drawChart('asset-donut-chart', 'donut-legend', personalData);

    // --- 6. 공금 차트 실행 ---
// ✅ 452~454번째 줄 수정
    const bankTotalPb  = bankPb.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.amount, 0);
    const stockTotalPb = stockPb.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.currentVal, 0);
    const rentTotalPb  = rentPb.filter(i => i.month === nowMonth).reduce((sum, i) => sum + i.deposit, 0);
    const totalPb = bankTotalPb + stockTotalPb + rentTotalPb;

    const publicCardCard = document.getElementById('public-chart-card');
    if (totalPb > 0) {
        publicCardCard.style.display = 'block'; // 데이터 있으면 보이기
        const publicData = [
            { label: '공유 주식', val: stockTotalPb, color: '#1E3A8A' }, // 진한 파랑
            { label: '공유 예금', val: bankTotalPb, color: '#3B82F6' }, // 파랑
            { label: '공유 기타자산', val: rentTotalPb, color: '#93C5FD' } // 연한 파랑
        ];
        drawChart('public-donut-chart', 'public-donut-legend', publicData);
    } else {
        publicCardCard.style.display = 'none'; // 데이터 없으면 카드 숨기기
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
    const now = new Date();
    // 로컬 시간 기준으로 YYYY-MM 형식 생성
    const localMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // 로컬 시간 기준으로 YYYY-MM-DD 형식 생성
    const localDate = `${localMonth}-${String(now.getDate()).padStart(2, '0')}`;

    document.querySelectorAll('input[type="month"]').forEach(i => i.value = localMonth);
    document.querySelectorAll('input[type="date"]').forEach(i => i.value = localDate);
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

// ✅ 추가: 페이지 로드 시 날짜 입력 필드 기본값 세팅
initInputs();

// 방금 복사한 구글 웹 앱 URL을 아래에 붙여넣으세요.
const MY_FREE_API_URL = "https://script.google.com/macros/s/AKfycbyw5PZhPa60oNbTFaOQiGnAYLqoSgx1c_6n0IbrkoSq8CKqLo7B21QZ34bGY-kgqFRuaQ/exec";


// --- 실시간 환율 가져오기 (무료 API, 캐싱 적용) ---
let cachedUsdKrw = null; // 환율을 한 번만 불러와서 저장해두는 변수 (API 과부하 방지)

async function getUsdKrwRate() {
    if (cachedUsdKrw) return cachedUsdKrw; // 이미 불러온 환율이 있으면 그대로 사용
    try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        cachedUsdKrw = data.rates.KRW;
        return cachedUsdKrw;
    } catch (error) {
        console.error("환율 정보를 가져오지 못했습니다.", error);
        return 1350; // API 통신 실패 시 비상용 임시 환율
    }
}

// ✅ 기존 fetchStockPrice 함수 교체
async function fetchStockPrice(ticker) {
    try {
        const origin = encodeURIComponent(window.location.hostname);
        const response = await fetch(`${MY_FREE_API_URL}?ticker=${encodeURIComponent(ticker)}&origin=${origin}`);
        const data = await response.json();
        
        if (data && data.price !== undefined) {
            let finalPrice = data.price; // 야후 파이낸스가 준 원본 가격 (원화 또는 달러)

            // 💡 핵심 로직: 종목코드(티커)가 한국 주식(.KS, .KQ)이 아니면 달러(USD)로 간주하고 환율 적용
            const upperTicker = ticker.toUpperCase();
            if (!upperTicker.endsWith('.KS') && !upperTicker.endsWith('.KQ')) {
                const exchangeRate = await getUsdKrwRate();
                finalPrice = finalPrice * exchangeRate; // 달러 가격에 현재 환율을 곱하여 원화로 변환
            }

            return finalPrice;
        } else {
            console.error("가격 정보가 없습니다:", data.error);
            return 0;
        }
    } catch (error) {
        console.error(`${ticker} 통신 실패:`, error);
        return 0; 
    }
}
// --- 수동 & 자동 현재가 일괄 업데이트 로직 ---

// 1. 보유 중인 모든 주식의 가격을 업데이트하는 함수
window.updateAllStockPrices = async function(isAuto = false) {
    if (!currentDbData.stock || currentDbData.stock.length === 0) {
        if(!isAuto) alert("등록된 주식이 없습니다.");
        return;
    }
    
    const btn = document.getElementById('btn-update-prices');
    if(btn) { btn.innerText = "업데이트 중..."; btn.disabled = true; }

    let updatedCount = 0;
    
    for (const item of currentDbData.stock) {
        if (item.ticker) {
            const newPrice = await fetchStockPrice(item.ticker);
            // 가져온 가격이 0보다 크고, 기존에 저장된 가격과 다를 때만 파이어베이스 업데이트 실행
            if (newPrice > 0 && newPrice !== item.currentPrice) {
                await updateDoc(doc(db, "stock", item.id), {
                    currentPrice: newPrice,
                    currentVal: newPrice * item.count
                });
                updatedCount++;
            }
        }
    }
    
    if(btn) { btn.innerText = "🔄 현재가 수동 업데이트"; btn.disabled = false; }
    if(!isAuto) alert(`총 ${updatedCount}개 종목의 최신 가격이 반영되었습니다.`);
};

// 2. 매일 오후 4시 이후 앱 실행 시 자동 업데이트를 체크하는 함수
function checkAfternoonAutoUpdate() {
    const now = new Date();
    // 오후 4시(16시) 이후인지 확인
    if (now.getHours() >= 16) {
        const todayStr = now.toDateString(); // 예: "Tue May 14 2026"
        const lastUpdate = localStorage.getItem('lastStockUpdate');
        
        // 오늘 4시 이후에 업데이트를 한 적이 없다면? -> 자동 업데이트 실행
        if (lastUpdate !== todayStr) {
            console.log("장 마감 이후 최초 접속 감지. 주식 데이터 자동 업데이트를 시작합니다.");
            updateAllStockPrices(true).then(() => {
                // 성공적으로 마치면 내 브라우저에 '오늘 업데이트 완료' 도장 찍기
                localStorage.setItem('lastStockUpdate', todayStr);
            });
        }
    }
}