import {GAMES, choosePlan, generateEntries, formatEntry, requiredBasePrizeForTarget, netPrize} from './lottery.js?v=20261007-lucky-coins';
import {createLuckEffects} from './luck-effects.js?v=20261007-lucky-coins';

const cash = value => `¥${Number(value).toLocaleString("zh-CN")}`;
const areaLabels = {ssq: ["红球", "蓝球"], dlt: ["前区", "后区"], kl8: ["选八", ""]};
const screens = [...document.querySelectorAll(".screen")];
const wishInput = document.querySelector("#wishInput");
const amountInput = document.querySelector("#amountInput");
const budgetInput = document.querySelector("#budgetInput");
const promiseInput = document.querySelector("#promiseInput");
const wishNext = document.querySelector('[data-action="wish-next"]');
const holdButton = document.querySelector('[data-action="hold"]');
const holdHint = document.querySelector("#holdHint");
const coinsError = document.querySelector("#coinsError");
const toast = document.querySelector("#toast");
// Only a complete, successfully sampled ticket is stored here. Inputs are drafts.
const state = {wish: "", amount: "50000", promise: "", game: null, plan: null, entries: []};
let luckEffects;
function safeEffect(name) {
  try { luckEffects?.[name](); } catch { /* Decorative feedback never blocks ticket generation. */ }
}
let holdFrame;
let holdStartedAt;
let heldKey;
let issuing = false;
const holdDuration = 1500;

const now = new Date();
const dateText = new Intl.DateTimeFormat("zh-CN", {month: "2-digit", day: "2-digit"}).format(now).replace("/", " · ");
document.querySelector("#todayLabel").textContent = dateText;
document.querySelector("#cardDate").textContent = `${now.getFullYear()} · ${dateText}`;

function showScreen(name) {
  screens.forEach(screen => {
    const active = screen.dataset.screen === name;
    screen.classList.toggle("is-active", active);
    screen.setAttribute("aria-hidden", String(!active));
    screen.inert = !active;
    if (active) screen.scrollTop = 0;
  });
}
function formatAmount(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? cash(digits) : "";
}
function paragraph(parent, text, className = '') {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) p.className = className;
  parent.append(p);
  return p;
}
function shortAllocation(plan) {
  const counts = new Map();
  for (const group of plan.groups) {
    const kind = `${group.multiplier}倍${group.additional ? '追加' : ''}`;
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  if (counts.size === 1) {
    const [kind, count] = [...counts][0];
    return `${count}组号码 · 每组${kind}`;
  }
  return [...counts].map(([kind, count]) => `${count}组${kind}`).join(' ＋ ');
}
function renderEntries() {
  const container = document.querySelector('#numbers');
  container.replaceChildren();
  state.entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'ticket-entry';
    paragraph(row, `第${index + 1}组 · ${entry.multiplier}倍${entry.additional ? ' · 追加' : ''} · ${cash(entry.cost)}`, 'entry-meta');
    for (const [area, label] of [['main', areaLabels[state.game][0]], ['special', areaLabels[state.game][1]]]) {
      if (!entry[area]?.length) continue;
      const line = document.createElement('div');
      line.className = `ball-row ${area === 'special' ? 'special-balls' : 'main-balls'}`;
      const name = document.createElement('span');
      name.className = 'ball-area-label';
      name.textContent = label;
      line.append(name);
      for (const number of entry[area]) {
        const ball = document.createElement('span');
        ball.className = 'ticket-ball';
        ball.textContent = String(number).padStart(2, '0');
        line.append(ball);
      }
      row.append(line);
    }
    container.append(row);
  });
}

function amountInWords(value) {
  return value >= 10000 ? `${Number((value / 10000).toFixed(4))}万元` : `${Math.ceil(value)}元`;
}
function coverageText(plan) {
  if (!(plan.target > 0)) return "";
  const game = GAMES[plan.game];
  const target = amountInWords(plan.target);
  if (plan.game === "kl8") {
    const best = plan.groups.reduce((a, b) => a.multiplier >= b.multiplier ? a : b);
    const net = netPrize(game.fixedTopPrize * best.multiplier);
    return net >= plan.target
      ? `${best.multiplier}倍组若全中8个，常规税后${amountInWords(net)}，可覆盖${target}心愿。`
      : `按常规奖金，单组最高税后${amountInWords(net)}，不足以独自覆盖${target}心愿。`;
  }
  // A taxed sufficient bound also remains valid when other prizes push a
  // small target's combined income beyond the 10,000-yuan exemption threshold.
  const grossNeeded = Math.ceil(plan.target / 0.8);
  const candidates = plan.groups.map(entry => {
    const factor = entry.additional ? 1.8 : 1;
    let threshold = Math.max(requiredBasePrizeForTarget({target: plan.target, multiplier: entry.multiplier, additional: entry.additional}), Math.ceil(grossNeeded / (entry.multiplier * factor)));
    const prize = base => (base + (entry.additional ? Math.floor(base * 4 / 5) : 0)) * entry.multiplier;
    while (prize(threshold) < grossNeeded) threshold += 1;
    return {...entry, threshold, possible: threshold <= game.maxBaseTopPrize && grossNeeded <= game.maxTotalTopPrize};
  }).filter(entry => entry.possible).sort((a, b) => a.threshold - b.threshold);
  if (!candidates.length) return `按奖金上限，本方案单组不足以独自覆盖${target}心愿；仍保留本次零钱。`;
  const best = candidates[0];
  return `${best.multiplier}倍${best.additional ? "追加" : ""}组中一等奖、基本单倍奖金≥${amountInWords(best.threshold)}，税后可覆盖${target}心愿；奖金随开奖浮动。`;
}
function renderResult() {
  document.querySelector("#cardWish").textContent = state.wish;
  document.querySelector("#cardAmount").textContent = formatAmount(state.amount);
  const outlet = state.game === "dlt" ? "体彩" : "福彩";
  document.querySelector("#numbersLabel").textContent = `${outlet} · ${GAMES[state.game].name}`;
  document.querySelector("#cardPlan").textContent = shortAllocation(state.plan);
  document.querySelector("#cardTotal").textContent = `共${state.plan.totalCost}元`;
  const condition = document.querySelector("#targetCondition");
  condition.textContent = coverageText(state.plan);
  condition.hidden = !condition.textContent;
  renderEntries();
  showScreen("result");
}
function validateBudget(value) {
  if (!Number.isInteger(value) || value < 2 || value > 200) throw new Error("请输入2–200枚幸运硬币，每枚1元。");
  return value;
}
function prepareCheck({wish, amount = "50000", budget = 20, promise}) {
  const cleanWish = String(wish || "").trim();
  if (cleanWish.length < 5 || cleanWish.length > 64) throw new Error("把心愿写具体一点，5–64个字。");
  const cleanAmount = String(amount || "").replace(/\D/g, "").slice(0, 8);
  const plan = choosePlan({budget: validateBudget(budget), target: Number(cleanAmount) || 0});
  const entries = generateEntries(plan);
  return {wish: cleanWish, amount: cleanAmount, promise: String(promise || "").trim().slice(0, 120), plan, entries, game: plan.game};
}
function resetHold() {
  cancelAnimationFrame(holdFrame);
  holdFrame = undefined;
  holdStartedAt = undefined;
  heldKey = undefined;
  issuing = false;
  holdButton.classList.remove("is-holding");
  holdButton.style.setProperty("--progress", "0%");
  document.querySelector("#receiveLabel").textContent = "收下这份幸运";
  holdHint.textContent = "长按，让好运登场";
  safeEffect("cancelHold");
}
function commitCheck(check) {
  resetHold();
  Object.assign(state, check);
  wishInput.value = state.wish;
  amountInput.value = state.amount;
  budgetInput.value = String(state.plan.budget);
  promiseInput.value = state.promise;
  coinsError.hidden = true;
  coinsError.textContent = "";
  renderResult();
  safeEffect("celebrate");
}
function createManifestation(input) {
  const check = prepareCheck(input);
  commitCheck(check);
  return {status: "manifesting", wish: state.wish, plan: {game: state.game, budget: state.plan.budget, totalCost: state.plan.totalCost}, entries: state.entries};
}
function registerWebMcp() {
  if (!document.modelContext?.registerTool) return;
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: "create_manifestation", title: "收下今天的幸运",
      description: "填写心愿、财富金额、幸运零钱和感谢语，生成今天的彩票方案与随机号码。",
      inputSchema: {type: "object", properties: {
        wish: {type: "string", minLength: 5, maxLength: 64},
        amount: {type: "string", pattern: "^[0-9]{0,8}$"},
        budget: {type: "integer", minimum: 2, maximum: 200},
        promise: {type: "string", maxLength: 120},
      }, required: ["wish"], additionalProperties: false},
      annotations: {readOnlyHint: false, untrustedContentHint: false},
      execute(input) {
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("需要提供心愿内容");
        return createManifestation(input);
      },
    })).catch(() => {});
  } catch { /* WebMCP is optional. */ }
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}
function purchaseText() {
  return [`${GAMES[state.game].name} · 单式 · ${shortAllocation(state.plan)} · 共${state.plan.totalCost}元`, ...state.entries.map((entry, index) => formatEntry(entry, state.game, index))].join("\n");
}
function shareText() {
  return ["宇宙银行 ✦ 今日幸运方案", `心愿：${state.wish}`, `心愿金额：${formatAmount(state.amount)}`, ...(state.promise ? [`感谢：${state.promise}`] : []), purchaseText(), "随机选号 · 奖金以官方公告为准"].join("\n");
}

// Public candidate ships without supplied music or third-party media.
const musicOptedOut = true;
const musicWanted = false;
function playMusic() {}

try {
  luckEffects = createLuckEffects({overlay: document.querySelector("#luckEffects"), isSoundEnabled: () => !musicOptedOut && musicWanted && !document.hidden});
} catch { /* The form and random numbers also work without decorative effects. */ }
function updateCoins() {
  resetHold();
  try {
    validateBudget(Number(budgetInput.value));
    holdButton.disabled = false;
    coinsError.hidden = true;
    coinsError.textContent = "";
  } catch (error) {
    holdButton.disabled = true;
    coinsError.hidden = false;
    coinsError.textContent = error.message;
  }
}
function cancelHold() {
  if (issuing || !document.querySelector('[data-screen="coins"]').classList.contains("is-active")) return;
  resetHold();
}
function beginHold() {
  if (issuing || holdFrame !== undefined || holdButton.disabled || !document.querySelector('[data-screen="coins"]').classList.contains("is-active")) return;
  holdButton.classList.add("is-holding");
  safeEffect("startHold");
  holdFrame = requestAnimationFrame(tickHold);
}
function tickHold(time) {
  if (holdStartedAt === undefined) holdStartedAt = time;
  const progress = Math.min((time - holdStartedAt) / holdDuration, 1);
  holdButton.style.setProperty("--progress", `${progress * 100}%`);
  holdHint.textContent = "幸运能量正在汇聚……";
  if (progress < 1) {
    holdFrame = requestAnimationFrame(tickHold);
    return;
  }
  holdFrame = undefined;
  issuing = true;
  try {
    const check = prepareCheck({wish: wishInput.value, amount: amountInput.value, budget: Number(budgetInput.value), promise: promiseInput.value});
    commitCheck(check);
    try { navigator.vibrate?.(35); } catch { /* Haptics are optional. */ }
  } catch {
    resetHold();
    holdHint.textContent = "再长按一次，让幸运重新连接。";
    coinsError.hidden = false;
    coinsError.textContent = "号码暂时没接通，请再试一次。";
  }
}
document.querySelector('[data-action="begin"]').addEventListener("click", () => {
  if (!musicOptedOut && !musicWanted) playMusic();
  showScreen("wish");
});
wishInput.addEventListener("input", () => {wishNext.disabled = wishInput.value.trim().length < 5 || wishInput.value.trim().length > 64;});
amountInput.addEventListener("input", () => {amountInput.value = amountInput.value.replace(/\D/g, "");});
wishNext.addEventListener("click", () => {updateCoins(); showScreen("coins");});
budgetInput.addEventListener("input", updateCoins);
promiseInput.addEventListener("input", cancelHold);
document.querySelector('[data-action="coins-back"]').addEventListener("click", () => {resetHold(); showScreen("wish");});
holdButton.addEventListener("pointerdown", event => {
  if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
  event.preventDefault();
  holdButton.setPointerCapture(event.pointerId);
  beginHold();
});
holdButton.addEventListener("pointerup", cancelHold);
holdButton.addEventListener("pointercancel", cancelHold);
holdButton.addEventListener("lostpointercapture", cancelHold);
holdButton.addEventListener("keydown", event => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (event.repeat) return;
  heldKey = event.key;
  beginHold();
});
holdButton.addEventListener("keyup", event => {
  if (event.key !== heldKey) return;
  event.preventDefault();
  cancelHold();
});
holdButton.addEventListener("blur", cancelHold);
document.addEventListener("visibilitychange", () => {if (document.hidden) resetHold();});
window.addEventListener("pagehide", () => {cancelHold(); safeEffect("dispose");});
document.querySelector('[data-action="copy"]').addEventListener("click", async () => {
  try {await navigator.clipboard.writeText(purchaseText()); showToast("方案已复制");}
  catch {showToast("暂时复制不了，可以截图保存");}
});
document.querySelector('[data-action="share"]').addEventListener("click", async () => {
  const text = shareText();
  if (navigator.share) {
    try {await navigator.share({title: "宇宙银行 · 今日幸运方案", text}); return;}
    catch (error) {if (error.name === "AbortError") return;}
  }
  try {await navigator.clipboard.writeText(text); showToast("支票已复制");}
  catch {showToast("暂时分享不了，可以截图保存");}
});
showScreen("welcome");
registerWebMcp();
