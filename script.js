import { auth, db } from "./firebase.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import { 
  doc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ---------------------
// Landing Page Auth
// ---------------------
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");

if(signupBtn){
  signupBtn.addEventListener("click", async ()=>{
    const email = document.getElementById("signupEmail").value;
    const pass = document.getElementById("signupPassword").value;
    if(!email || !pass) return alert("Fill all fields");
    try{
      const userCred = await createUserWithEmailAndPassword(auth,email,pass);
      const user = userCred.user;
      // Create default wallets
      const currencies = ["USD","ZMW","NGN","BTC","USDT"];
      for(const c of currencies){
        await setDoc(doc(db,"wallets",`${user.uid}_${c}`),{userId:user.uid,currency:c,balance:0,createdAt:serverTimestamp()});
      }
      alert("Account created!");
      location.href="dashboard.html";
    }catch(e){ alert(e.message); }
  });
}

if(loginBtn){
  loginBtn.addEventListener("click", async ()=>{
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPassword").value;
    if(!email || !pass) return alert("Fill all fields");
    try{
      await signInWithEmailAndPassword(auth,email,pass);
      location.href="dashboard.html";
    }catch(e){ alert(e.message); }
  });
}

// ---------------------
// Dashboard Auth & Logout
// ---------------------
onAuthStateChanged(auth, async (user) => {
  if(!user) location.href="index.html";
  else {
    loadWallets(user.uid);
    loadTransactions(user.uid);
  }
});

const logoutBtn = document.getElementById("logoutBtn");
if(logoutBtn){
  logoutBtn.addEventListener("click", async ()=>{
    await signOut(auth);
    location.href="index.html";
  });
}

// ---------------------
// Load Wallets
// ---------------------
async function loadWallets(uid){
  const walletCards = document.getElementById("walletCards");
  walletCards.innerHTML = '';
  const walletsSnap = await getDocs(query(collection(db,"wallets"), where("userId","==",uid)));
  walletsSnap.forEach(docSnap=>{
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className="wallet-card inline-block";
    card.innerHTML=`<h3>${data.currency} Wallet</h3><p>${data.balance.toFixed(2)}</p>`;
    walletCards.appendChild(card);
  });
}

// ---------------------
// Send Money
// ---------------------
const sendBtn = document.getElementById("sendBtn");
if(sendBtn){
  sendBtn.addEventListener("click", async ()=>{
    const user = auth.currentUser;
    const fromUid = user.uid;
    const toUid = document.getElementById("recipientUid").value;
    const amount = parseFloat(document.getElementById("sendAmount").value);
    const currency = document.getElementById("sendCurrency").value;

    if(!toUid || !amount || amount<=0) return alert("Fill all fields correctly");

    try{
      // Get sender wallet
      const fromWalletRef = doc(db,"wallets",`${fromUid}_${currency}`);
      const fromSnap = await getDoc(fromWalletRef);
      if(!fromSnap.exists()) return alert("Sender wallet not found");
      if(fromSnap.data().balance < amount) return alert("Insufficient funds");

      // Deduct from sender
      await updateDoc(fromWalletRef,{balance: fromSnap.data().balance - amount});

      // Add to receiver wallet (create if not exists)
      const toWalletRef = doc(db,"wallets",`${toUid}_${currency}`);
      const toSnap = await getDoc(toWalletRef);
      if(toSnap.exists()){
        await updateDoc(toWalletRef,{balance: toSnap.data().balance + amount});
      } else {
        await setDoc(toWalletRef,{userId:toUid,currency:currency,balance:amount,createdAt:serverTimestamp()});
      }

      // Log transaction
      await addDoc(collection(db,"transactions"),{
        type:"send",
        fromUser:fromUid,
        toUser:toUid,
        amount,
        currency,
        status:"completed",
        createdAt:serverTimestamp()
      });

      alert("Money sent successfully");
      loadWallets(fromUid);
      loadTransactions(fromUid);

    }catch(e){ alert(e.message); }
  });
}

// ---------------------
// Crypto Deposit / Withdraw
// ---------------------
const cryptoBtn = document.getElementById("cryptoBtn");
if(cryptoBtn){
  cryptoBtn.addEventListener("click", async ()=>{
    const user = auth.currentUser;
    const uid = user.uid;
    const cryptoType = document.getElementById("cryptoType").value.toUpperCase();
    const amount = parseFloat(document.getElementById("cryptoAmount").value);
    const action = document.getElementById("cryptoAction").value;

    if(!cryptoType || !amount || amount<=0) return alert("Fill all fields correctly");

    try{
      const walletRef = doc(db,"wallets",`${uid}_${cryptoType}`);
      const snap = await getDoc(walletRef);
      if(action === "deposit"){
        if(snap.exists()){
          await updateDoc(walletRef,{balance: snap.data().balance + amount});
        } else {
          await setDoc(walletRef,{userId:uid,currency:cryptoType,balance:amount,createdAt:serverTimestamp()});
        }
      } else if(action === "withdraw"){
        if(!snap.exists() || snap.data().balance < amount) return alert("Insufficient crypto balance");
        await updateDoc(walletRef,{balance: snap.data().balance - amount});
      }

      // Log transaction
      await addDoc(collection(db,"transactions"),{
        type:action,
        user:uid,
        crypto:cryptoType,
        amount,
        status:"completed",
        createdAt:serverTimestamp()
      });

      alert(`Crypto ${action} successful`);
      loadWallets(uid);
      loadTransactions(uid);

    }catch(e){ alert(e.message); }
  });
}

// ---------------------
// Load Transactions
// ---------------------
async function loadTransactions(uid){
  const tbody = document.getElementById("transactionsBody");
  tbody.innerHTML = '';
  const txSnap = await getDocs(query(collection(db,"transactions"), where("fromUser","==",uid)));
  txSnap.forEach(docSnap=>{
    const tx = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tx.createdAt ? new Date(tx.createdAt.seconds*1000).toLocaleString() : ""}</td>
      <td>${tx.type}</td>
      <td>${tx.fromUser || uid}</td>
      <td>${tx.toUser || "-"}</td>
      <td>${tx.amount}</td>
      <td>${tx.currency || tx.crypto || "-"}</td>
      <td>${tx.status}</td>
    `;
    tbody.appendChild(tr);
  });
}
