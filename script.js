const contractAddress = "0x76b0b6ec24E05136638D842AC82912935Cb6DFA2";

const abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("請先安裝 MetaMask！");
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    const address = accounts[0];
    document.getElementById("walletAddress").innerText =
      "已連接錢包：" + address;
  } catch (error) {
    console.error("連接錢包失敗：", error);
    alert("連接錢包失敗");
  }
}

async function getBalance() {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("請先安裝 MetaMask！");
      return;
    }

    if (typeof ethers === "undefined") {
      alert("ethers.js 沒有載入成功");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();

    if (network.chainId !== 11155111) {
      alert("請先切換到 Sepolia 測試網");
      return;
    }

    const signer = provider.getSigner();
    const address = await signer.getAddress();

    const contract = new ethers.Contract(contractAddress, abi, provider);

    const balance = await contract.balanceOf(address);
    const decimals = await contract.decimals();
    const formatted = ethers.utils.formatUnits(balance, decimals);

    document.getElementById("balance").innerText =
      "QZT 餘額：" +
      Number(formatted).toLocaleString("zh-TW", {
        maximumFractionDigits: 4
      });
  } catch (error) {
    console.error("查詢餘額失敗：", error);
    alert("查詢餘額失敗");
  }
}

async function rewardStudent() {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("請先安裝 MetaMask！");
      return;
    }

    if (typeof ethers === "undefined") {
      alert("ethers.js 沒有載入成功");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();

    if (network.chainId !== 11155111) {
      alert("請先切換到 Sepolia 測試網");
      return;
    }

    const signer = provider.getSigner();
    const sender = await signer.getAddress();

    const contract = new ethers.Contract(contractAddress, abi, signer);

    const studentAddress = document.getElementById("studentAddress").value.trim();
    const rewardReason = document.getElementById("rewardReason").value.trim();
    const rewardAmountInput = document.getElementById("rewardAmount").value.trim();

    if (!studentAddress) {
      alert("請輸入學生地址");
      return;
    }

    if (!ethers.utils.isAddress(studentAddress)) {
      alert("學生地址格式不正確");
      return;
    }

    if (!rewardReason) {
      alert("請輸入獎勵原因");
      return;
    }

    if (!rewardAmountInput || Number(rewardAmountInput) <= 0) {
      alert("請輸入正確的獎勵數量");
      return;
    }

    const decimals = await contract.decimals();
    const amount = ethers.utils.parseUnits(rewardAmountInput, decimals);

    const senderBalance = await contract.balanceOf(sender);

    if (senderBalance.lt(amount)) {
      alert("你的 QZT 餘額不足");
      document.getElementById("txStatus").innerText =
        "交易狀態：發放失敗，QZT 餘額不足";
      return;
    }

    document.getElementById("txStatus").innerText = "交易狀態：發放中...";

    const tx = await contract.transfer(studentAddress, amount);

    document.getElementById("txStatus").innerText =
      "交易狀態：交易已送出，等待確認中...\nTx Hash: " + tx.hash;

    await tx.wait();

    document.getElementById("txStatus").innerText =
      "交易狀態：發放成功！\nTx Hash: " + tx.hash;

    addRewardHistory(studentAddress, rewardReason, rewardAmountInput, tx.hash);

    await getBalance();

    document.getElementById("studentAddress").value = "";
    document.getElementById("rewardReason").value = "";
    document.getElementById("rewardAmount").value = "";
  } catch (error) {
    console.error("發放獎勵失敗：", error);
    document.getElementById("txStatus").innerText = "交易狀態：發放失敗";
    alert("發放失敗，請查看 Console");
  }
}

function addRewardHistory(studentAddress, rewardReason, rewardAmount, txHash) {
  const historyList = document.getElementById("rewardHistory");
  const li = document.createElement("li");

  li.innerText =
    `學生：${studentAddress}｜原因：${rewardReason}｜數量：${rewardAmount} QZT｜Tx: ${txHash}`;

  historyList.prepend(li);
}

async function submitAnswer() {
  const studentAnswer = document.getElementById("studentAnswer").value.trim();
  const studentWallet = document.getElementById("studentWallet").value.trim();

  if (!studentAnswer) {
    alert("請輸入答案");
    return;
  }

  if (!studentWallet) {
    alert("請輸入錢包地址");
    return;
  }

  document.getElementById("result").innerText = "評分中...";

  try {
    const response = await fetch("/api/grade-and-reward", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: "小明買了3支鉛筆，每支12元，又買了1本筆記本25元，總共多少元？",
        referenceAnswer: "總共61元。",
        gradingRubric: "答案需明確表示總價為61元；若數值正確但文字略有差異，可判正確。",
        studentAnswer,
        studentWallet
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API 錯誤：${response.status} ${text}`);
    }

    const data = await response.json();

    document.getElementById("result").innerText =
      `分數：${data.score}\n` +
      `是否正確：${data.is_correct}\n` +
      `信心：${data.confidence}\n` +
      `評語：${data.reason}\n` +
      `是否發幣：${data.rewarded}\n` +
      `交易：${data.txHash || "無"}`;
  } catch (error) {
    console.error("submitAnswer 錯誤：", error);
    document.getElementById("result").innerText = "送出失敗：" + error.message;
  }
}