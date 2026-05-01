const STORAGE_KEY = "edubridge.mvp.v1";

const catalog = [
  {
    id: "stationery",
    title: "文具補給包",
    cost: 120,
    icon: "pencil-ruler",
    description: "筆記本、螢光筆與考前整理卡。"
  },
  {
    id: "course",
    title: "線上課程券",
    cost: 250,
    icon: "graduation-cap",
    description: "合作課程折抵券，可用於升學與技能課。"
  },
  {
    id: "donation",
    title: "偏鄉學校捐贈",
    cost: 80,
    icon: "hand-heart",
    description: "轉為教具、參考書或班級共用資源。"
  },
  {
    id: "report",
    title: "學習歷程報告",
    cost: 60,
    icon: "file-badge",
    description: "整理問答、筆記與採納紀錄。"
  }
];

const levelDefinitions = [
  ["L0", "Email", "瀏覽、提問"],
  ["L1", "手機", "回答、累積 EDU"],
  ["L2", "學生", "兌換商城、贊助"],
  ["L3", "認證", "審核、DAO 投票"]
];

const defaultState = {
  profile: {
    wallet: "",
    points: 180,
    reputation: 42,
    streak: 3,
    lastCheckin: "",
    role: "解題者"
  },
  questions: [
    {
      id: "q-101",
      title: "二次函數 y = x² - 6x + 5 的頂點怎麼找？",
      body: "我知道可以配方，但常常把符號弄錯。想確認頂點、對稱軸和最小值的寫法。",
      subject: "數學",
      grade: "高中",
      difficulty: "senior",
      author: "花蓮高一學生",
      bounty: 18,
      createdAt: "2026-05-01T08:30:00.000Z",
      answers: [
        {
          id: "a-201",
          author: "台中大學生 Mina",
          body: "先把 x² - 6x 配成 (x - 3)² - 9，所以原式是 (x - 3)² - 4。頂點是 (3, -4)，對稱軸 x = 3，最小值 -4。",
          score: 94,
          reward: 28.2,
          accepted: true,
          reason: "步驟完整，配方與結論清楚。"
        }
      ]
    },
    {
      id: "q-102",
      title: "關係代名詞 which 和 that 什麼時候不能互換？",
      body: "英文作文常被改這裡。想知道限定用法和非限定用法差在哪裡。",
      subject: "英文",
      grade: "高中",
      difficulty: "senior",
      author: "屏東自學生",
      bounty: 14,
      createdAt: "2026-05-01T06:20:00.000Z",
      answers: []
    },
    {
      id: "q-103",
      title: "電解質和非電解質怎麼快速判斷？",
      body: "自然課提到酸、鹼、鹽，但遇到糖水、酒精和食鹽水時容易混淆。",
      subject: "自然",
      grade: "國中",
      difficulty: "junior",
      author: "南投國三學生",
      bounty: 10,
      createdAt: "2026-04-30T14:10:00.000Z",
      answers: []
    }
  ],
  notes: [
    {
      id: "n-301",
      title: "英文關係子句三格整理",
      subject: "英文",
      body: "先判斷先行詞是人或物，再看關係代名詞在子句中當主詞、受詞或所有格。非限定用法逗號後通常不用 that。",
      author: "Mina",
      likes: 18,
      createdAt: "2026-04-30T12:00:00.000Z"
    },
    {
      id: "n-302",
      title: "配方法符號檢查表",
      subject: "數學",
      body: "x² + bx 配成 (x + b/2)² - (b/2)²。配完一定展開回去檢查一次，常數項最後再合併。",
      author: "Kai",
      likes: 23,
      createdAt: "2026-04-29T09:00:00.000Z"
    }
  ],
  redemptions: [],
  activity: [
    "完成 1 則高中數學詳解",
    "分享 2 篇學習筆記",
    "累積 3 天簽到"
  ]
};

let state = loadState();
let selectedQuestionId = state.questions[0]?.id || "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const formatter = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderAll();
});

function bindEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#connectWalletBtn").addEventListener("click", connectWallet);
  $("#dailyCheckinBtn").addEventListener("click", dailyCheckin);
  $("#subjectFilter").addEventListener("change", renderQuestionBoard);
  $("#questionForm").addEventListener("submit", createQuestion);
  $("#answerForm").addEventListener("submit", submitAnswer);
  $("#noteForm").addEventListener("submit", createNote);

  document.body.addEventListener("click", (event) => {
    const questionButton = event.target.closest("[data-select-question]");
    const redeemButton = event.target.closest("[data-redeem]");
    const adoptButton = event.target.closest("[data-adopt]");

    if (questionButton) {
      selectedQuestionId = questionButton.dataset.selectQuestion;
      renderQuestionBoard();
      renderSelectedQuestion();
    }

    if (redeemButton) {
      redeemReward(redeemButton.dataset.redeem);
    }

    if (adoptButton) {
      adoptAnswer(adoptButton.dataset.adopt);
    }
  });
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : cloneDefaultState();
  } catch (error) {
    console.warn("State reset because localStorage data was unreadable.", error);
    return cloneDefaultState();
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function normalizeState(value) {
  const base = cloneDefaultState();
  return {
    ...base,
    ...value,
    profile: { ...base.profile, ...(value.profile || {}) },
    questions: Array.isArray(value.questions) ? value.questions : base.questions,
    notes: Array.isArray(value.notes) ? value.notes : base.notes,
    redemptions: Array.isArray(value.redemptions) ? value.redemptions : base.redemptions,
    activity: Array.isArray(value.activity) ? value.activity : base.activity
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderProfile();
  renderStats();
  renderMissions();
  renderQuestionBoard();
  renderSelectedQuestion();
  renderNotes();
  renderMarket();
  renderTrust();
  refreshIcons();
}

function setView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  if (viewId === "market") renderMarket();
  if (viewId === "trust") renderTrust();
  refreshIcons();
}

function renderProfile() {
  const wallet = state.profile.wallet;
  $("#walletLabel").textContent = wallet ? shortenAddress(wallet) : "訪客模式";
}

function renderStats() {
  const answers = state.questions.flatMap((question) => question.answers);
  const accepted = answers.filter((answer) => answer.accepted).length;
  const donated = state.redemptions
    .filter((item) => item.catalogId === "donation")
    .reduce((sum, item) => sum + item.cost, 0);

  const stats = [
    ["EDU 點數", `${formatter.format(state.profile.points)} EDU`],
    ["已解題", `${answers.length} 則`],
    ["最佳解答", `${accepted} 則`],
    ["公益捐贈", `${formatter.format(donated)} EDU`]
  ];

  $("#statsGrid").innerHTML = stats
    .map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");

  $("#hotQuestions").innerHTML = state.questions
    .slice(0, 3)
    .map((question) => compactItem(question.title, `${question.subject} · ${question.bounty} EDU 懸賞`))
    .join("");
}

function renderMissions() {
  const today = getToday();
  const missions = [
    ["每日簽到", state.profile.lastCheckin === today ? "已完成" : "+5 EDU"],
    ["回答一題", state.questions.some((question) => question.answers.length > 0) ? "已累積" : "+10 EDU 起"],
    ["分享筆記", `${state.notes.length} 篇`]
  ];

  $("#missionList").innerHTML = missions
    .map(([title, status]) => `
      <article class="mission-card">
        <strong>${title}</strong>
        <small>${status}</small>
      </article>
    `)
    .join("");
}

function renderQuestionBoard() {
  const filter = $("#subjectFilter")?.value || "all";
  const questions = filter === "all"
    ? state.questions
    : state.questions.filter((question) => question.subject === filter);

  $("#questionCount").textContent = `${questions.length} 題`;
  $("#questionList").innerHTML = questions.length
    ? questions.map(renderQuestionCard).join("")
    : `<div class="empty-state">目前沒有符合條件的題目。</div>`;

  refreshIcons();
}

function renderQuestionCard(question) {
  const answerCount = question.answers.length;
  return `
    <button class="question-card ${question.id === selectedQuestionId ? "active" : ""}" type="button" data-select-question="${question.id}">
      <h3>${escapeHtml(question.title)}</h3>
      <div class="question-meta">
        <span>${question.subject}</span>
        <span>${question.grade}</span>
        <span>${answerCount} 則解答</span>
        <span>${question.bounty} EDU</span>
      </div>
    </button>
  `;
}

function renderSelectedQuestion() {
  const question = getSelectedQuestion();
  if (!question) {
    $("#selectedQuestion").innerHTML = `<div class="empty-state">請先選擇一題。</div>`;
    $("#answerList").innerHTML = "";
    return;
  }

  $("#selectedQuestion").innerHTML = `
    <article class="selected-question">
      <div class="question-meta">
        <span>${question.subject}</span>
        <span>${question.grade}</span>
        <span>${difficultyLabel(question.difficulty)}</span>
        <span>${formatDate(question.createdAt)}</span>
      </div>
      <h2>${escapeHtml(question.title)}</h2>
      <p>${escapeHtml(question.body)}</p>
    </article>
  `;

  $("#answerList").innerHTML = question.answers.length
    ? question.answers.map((answer) => renderAnswerCard(question.id, answer)).join("")
    : `<div class="empty-state">這題還在等第一則詳解。</div>`;

  refreshIcons();
}

function renderAnswerCard(questionId, answer) {
  return `
    <article class="answer-card ${answer.accepted ? "accepted" : ""}">
      <div class="answer-meta">
        <span>${escapeHtml(answer.author)}</span>
        <span class="score-chip">${answer.score} 分</span>
        <span>${formatter.format(answer.reward)} EDU</span>
        ${answer.accepted ? "<span>最佳解答</span>" : ""}
      </div>
      <p>${escapeHtml(answer.body)}</p>
      <small>${escapeHtml(answer.reason)}</small>
      ${answer.accepted ? "" : `
        <button class="ghost-button" type="button" data-adopt="${questionId}:${answer.id}">
          <i data-lucide="circle-check"></i>
          <span>採納</span>
        </button>
      `}
    </article>
  `;
}

function renderNotes() {
  $("#notesList").innerHTML = state.notes
    .map((note) => `
      <article class="note-card">
        <div class="note-meta">
          <span>${note.subject}</span>
          <span>${formatDate(note.createdAt)}</span>
          <span>${note.likes} 人收藏</span>
        </div>
        <h3>${escapeHtml(note.title)}</h3>
        <p>${escapeHtml(note.body)}</p>
      </article>
    `)
    .join("");
}

function renderMarket() {
  $("#marketBalance").textContent = `${formatter.format(state.profile.points)} EDU`;
  $("#marketGrid").innerHTML = catalog
    .map((item) => `
      <article class="market-card">
        <div class="market-icon"><i data-lucide="${item.icon}"></i></div>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
        <strong>${item.cost} EDU</strong>
        <button class="primary-action" type="button" data-redeem="${item.id}">
          <i data-lucide="ticket-check"></i>
          <span>兌換</span>
        </button>
      </article>
    `)
    .join("");

  $("#redemptionHistory").innerHTML = state.redemptions.length
    ? state.redemptions.slice(0, 6).map((item) => compactItem(item.title, `${item.cost} EDU · ${formatDate(item.createdAt)}`)).join("")
    : `<div class="empty-state">尚無兌換紀錄。</div>`;

  refreshIcons();
}

function renderTrust() {
  const reputation = Math.max(0, Math.min(100, state.profile.reputation));
  const level = reputation >= 80 ? "L3 認證" : reputation >= 60 ? "L2 學生" : reputation >= 20 ? "L1 一般" : "L0 訪客";
  $("#trustLevel").textContent = level;
  $("#reputationScore").textContent = Math.round(reputation);
  $("#reputationBar").style.width = `${reputation}%`;

  $("#levelList").innerHTML = levelDefinitions
    .map(([code, name, scope]) => `
      <article class="level-item ${level.startsWith(code) ? "active" : ""}">
        <strong>${code}</strong>
        <div>
          <strong>${name}</strong>
          <span>${scope}</span>
        </div>
      </article>
    `)
    .join("");

  $("#activityList").innerHTML = state.activity.length
    ? state.activity.slice(0, 6).map((item) => compactItem(item, "近期紀錄")).join("")
    : `<div class="empty-state">尚無貢獻紀錄。</div>`;

  refreshIcons();
}

function createQuestion(event) {
  event.preventDefault();
  const question = {
    id: createId(),
    title: $("#questionTitle").value.trim(),
    body: $("#questionBody").value.trim(),
    subject: $("#questionSubject").value,
    grade: $("#questionGrade").value,
    difficulty: $("#questionDifficulty").value,
    author: state.profile.wallet ? shortenAddress(state.profile.wallet) : "訪客提問者",
    bounty: difficultyReward($("#questionDifficulty").value),
    createdAt: new Date().toISOString(),
    answers: []
  };

  state.questions.unshift(question);
  selectedQuestionId = question.id;
  addPoints(5, "發布一則優質提問");
  state.activity.unshift(`發布題目：${question.title}`);
  event.target.reset();
  saveState();
  renderAll();
  showToast("題目已發布，獲得 5 EDU。");
}

async function submitAnswer(event) {
  event.preventDefault();
  const question = getSelectedQuestion();
  const answerText = $("#answerBody").value.trim();
  if (!question || !answerText) return;

  const button = event.submitter;
  button.disabled = true;
  button.querySelector("span").textContent = "評分中";

  try {
    const result = await gradeAnswer(question, answerText);
    const reward = Number(result.rewardTokens || 0);
    const answer = {
      id: createId(),
      author: state.profile.wallet ? shortenAddress(state.profile.wallet) : "訪客解題者",
      body: answerText,
      score: result.score,
      reward,
      accepted: false,
      reason: result.reason || "已完成評分。"
    };

    question.answers.unshift(answer);
    if (result.rewarded) {
      addPoints(reward, `提交詳解：${question.title}`);
      state.profile.reputation = Math.min(100, state.profile.reputation + 4);
    }
    state.activity.unshift(`詳解獲得 ${result.score} 分：${question.title}`);
    $("#answerBody").value = "";
    saveState();
    renderAll();
    showToast(result.rewarded ? `評分 ${result.score} 分，獲得 ${formatter.format(reward)} EDU。` : `評分 ${result.score} 分，先保留為練習紀錄。`);
  } catch (error) {
    console.error(error);
    showToast("評分暫時失敗，請稍後再試。");
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "送出詳解並評分";
  }
}

async function gradeAnswer(question, answerText) {
  try {
    const response = await fetch("/api/grade-and-reward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: `${question.title}\n${question.body}`,
        answer: answerText,
        difficulty: question.difficulty,
        subject: question.subject,
        wallet: state.profile.wallet
      })
    });

    if (!response.ok) throw new Error(`API responded ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("Using local scorer because the API is unavailable.", error);
    return localGrade(question, answerText);
  }
}

function localGrade(question, answerText) {
  const length = answerText.length;
  const structure = /(首先|接著|最後|步驟|因此|所以|因為|結論|1\.|2\.)/.test(answerText) ? 18 : 0;
  const evidence = /(公式|代入|推導|例子|單位|檢查|定義|比較)/.test(answerText) ? 16 : 0;
  const lengthScore = Math.min(32, Math.floor(length / 5));
  const overlap = question.title.split("").filter((char) => char.trim() && answerText.includes(char)).length;
  const score = Math.max(0, Math.min(100, 34 + structure + evidence + lengthScore + Math.min(18, overlap)));
  const rewarded = score >= 70;
  const rewardTokens = rewarded ? calculateReward(score, question.difficulty) : 0;

  return {
    success: true,
    is_correct: rewarded,
    score,
    reason: rewarded ? "回答包含足夠步驟與關鍵概念。" : "內容仍偏短，建議補上推導、定義或檢查過程。",
    confidence: 0.72,
    rewarded,
    rewardTokens,
    txHash: null,
    mode: "browser-fallback"
  };
}

function createNote(event) {
  event.preventDefault();
  const note = {
    id: createId(),
    title: $("#noteTitle").value.trim(),
    subject: $("#noteSubject").value,
    body: $("#noteBody").value.trim(),
    author: state.profile.wallet ? shortenAddress(state.profile.wallet) : "訪客筆記者",
    likes: 0,
    createdAt: new Date().toISOString()
  };

  state.notes.unshift(note);
  addPoints(6, `分享筆記：${note.title}`);
  state.profile.reputation = Math.min(100, state.profile.reputation + 2);
  state.activity.unshift(`分享筆記：${note.title}`);
  event.target.reset();
  saveState();
  renderAll();
  showToast("筆記已發布，獲得 6 EDU。");
}

function redeemReward(catalogId) {
  const item = catalog.find((entry) => entry.id === catalogId);
  if (!item) return;
  if (state.profile.points < item.cost) {
    showToast("EDU 點數不足，先完成更多學習任務。");
    return;
  }

  state.profile.points -= item.cost;
  state.redemptions.unshift({
    id: createId(),
    catalogId,
    title: item.title,
    cost: item.cost,
    createdAt: new Date().toISOString()
  });
  state.activity.unshift(`兌換：${item.title}`);
  saveState();
  renderAll();
  showToast(`已兌換 ${item.title}。`);
}

function adoptAnswer(payload) {
  const [questionId, answerId] = payload.split(":");
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;
  const answer = question.answers.find((item) => item.id === answerId);
  if (!answer || answer.accepted) return;

  question.answers.forEach((item) => {
    item.accepted = false;
  });
  answer.accepted = true;
  const bonus = Math.round(answer.reward * 0.5);
  addPoints(bonus, `最佳解答加成：${question.title}`);
  state.profile.reputation = Math.min(100, state.profile.reputation + 6);
  state.activity.unshift(`採納最佳解答：${question.title}`);
  saveState();
  renderAll();
  showToast(`已採納解答，加成 ${bonus} EDU。`);
}

function dailyCheckin() {
  const today = getToday();
  if (state.profile.lastCheckin === today) {
    showToast("今天已完成簽到。");
    return;
  }

  state.profile.lastCheckin = today;
  state.profile.streak += 1;
  addPoints(5, "每日簽到");
  state.activity.unshift(`完成第 ${state.profile.streak} 天簽到`);
  saveState();
  renderAll();
  showToast("簽到成功，獲得 5 EDU。");
}

async function connectWallet() {
  if (!window.ethereum) {
    showToast("尚未偵測到 MetaMask，已維持訪客模式。");
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.profile.wallet = accounts[0];
    state.activity.unshift(`連接錢包：${shortenAddress(accounts[0])}`);
    saveState();
    renderAll();
    showToast("錢包已連接。");
  } catch (error) {
    console.error(error);
    showToast("錢包連接未完成。");
  }
}

function addPoints(amount, reason) {
  state.profile.points = Number((state.profile.points + Number(amount)).toFixed(1));
  if (reason) state.activity.unshift(reason);
}

function getSelectedQuestion() {
  return state.questions.find((question) => question.id === selectedQuestionId) || state.questions[0];
}

function difficultyReward(difficulty) {
  const map = { junior: 10, senior: 14, college: 20 };
  return map[difficulty] || 10;
}

function difficultyLabel(difficulty) {
  const map = { junior: "國中題", senior: "高中題", college: "延伸題" };
  return map[difficulty] || difficulty;
}

function calculateReward(score, difficulty) {
  const base = 10;
  const quality = Math.max(0.5, Math.min(1.5, score / 80));
  const difficultyMultiplier = { junior: 1, senior: 1.5, college: 2 }[difficulty] || 1;
  return Number((base * quality * difficultyMultiplier).toFixed(1));
}

function compactItem(title, meta) {
  return `
    <article class="compact-item">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(meta)}</span>
    </article>
  `;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
