const UINT32_SIZE = 2 ** 32;

export const GAMES = Object.freeze({
  ssq: Object.freeze({
    id: "ssq", name: "双色球", label: "双色球 · 6 红 + 1 蓝",
    mainCount: 6, mainMax: 33, mainLabel: "红球",
    specialCount: 1, specialMax: 16, specialLabel: "蓝球",
    basePrice: 2, additionalPrice: 0, maxMultiplier: 99,
    comboCount: 17721088, maxBaseTopPrize: 10000000, maxTotalTopPrize: 100000000,
    sourceUrl: "https://www.scflcp.com.cn/yxgz/823145252.jhtml",
  }),
  dlt: Object.freeze({
    id: "dlt", name: "大乐透", label: "大乐透 · 5 前区 + 2 后区",
    mainCount: 5, mainMax: 35, mainLabel: "前区",
    specialCount: 2, specialMax: 12, specialLabel: "后区",
    basePrice: 2, additionalPrice: 1, maxMultiplier: 99,
    comboCount: 21425712, maxBaseTopPrize: 10000000, maxTotalTopPrize: 100000000,
    sourceUrl: "https://m.sporttery.cn/bzzx/20210207/3002858.html?gid=5",
  }),
  kl8: Object.freeze({
    id: "kl8", name: "快乐 8 · 选八", label: "快乐 8 · 选八",
    mainCount: 8, mainMax: 80, mainLabel: "号码",
    specialCount: 0, specialMax: 0, specialLabel: "",
    basePrice: 2, additionalPrice: 0, maxMultiplier: 15,
    fixedTopPrize: 50000,
    sourceUrl: "https://www.scflcp.com.cn/yxgz/823144315.jhtml",
  }),
});

function getGame(game) {
  const value = Object.hasOwn(GAMES, game) ? GAMES[game] : undefined;
  if (!value) throw new RangeError("请选择双色球、大乐透或快乐 8 选八。");
  return value;
}

function validateAmount(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label}必须是大于或等于 0 的金额。`);
  }
  return value;
}

// The exemption is a threshold: above 10,000 yuan, the entire prize is taxed.
export function netPrize(gross) {
  validateAmount(gross, "税前奖金");
  return gross <= 10000 ? gross : gross * 0.8;
}

export function grossForTarget(net) {
  validateAmount(net, "到手目标");
  return net <= 10000 ? net : net / 0.8;
}

/** Prize amounts are whole yuan; additional prizes are rounded down per base bet. */
export function requiredBasePrizeForTarget({ target, multiplier = 1, additional = false }) {
  validateAmount(target, "到手目标");
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 99) {
    throw new RangeError("倍数请输入 1 至 99 的整数。");
  }
  if (typeof additional !== "boolean") throw new TypeError("追加选项必须是开启或关闭。");
  let basePrize = Math.ceil(grossForTarget(target) / (multiplier * (additional ? 1.8 : 1)));
  if (!Number.isSafeInteger(basePrize)) throw new RangeError("到手目标超出可准确计算的金额范围。");
  while (true) {
    const additionalPrize = additional ? Math.floor(basePrize * 4 / 5) : 0;
    const gross = (basePrize + additionalPrize) * multiplier;
    if (netPrize(gross) >= target) return basePrize;
    basePrize += 1;
    if (!Number.isSafeInteger(basePrize)) throw new RangeError("到手目标超出可准确计算的金额范围。");
  }
}

function combinations(n, k) {
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = value * (n - index + 1) / index;
  }
  return value;
}

function group(multiplier, additional, primary) {
  const unitPrice = additional ? 3 : 2;
  return { multiplier, additional, unitPrice, cost: unitPrice * multiplier, primary };
}

/** Build an exact-cost ticket plan. A group is one unique number combination. */
export function buildPlan({ game, budget, multiplier = 1, additional = false, target = 0 }) {
  const metadata = getGame(game);
  if (!Number.isInteger(budget) || budget < 2 || budget > 200) {
    throw new RangeError("本次预算请输入 2 至 200 元的整数。");
  }
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > metadata.maxMultiplier) {
    throw new RangeError(`${metadata.name}的倍数请输入 1 至 ${metadata.maxMultiplier} 的整数。`);
  }
  if (typeof additional !== "boolean") throw new TypeError("追加选项必须是开启或关闭。");
  if (additional && game !== "dlt") throw new RangeError("只有大乐透支持追加投注。");
  validateAmount(target, "到手目标");
  if (game !== "dlt" && budget % 2 !== 0) {
    throw new RangeError(`${metadata.name}每注 2 元，当前奇数预算无法正好用完。请调整本次预算。`);
  }

  const primaryCost = (additional ? 3 : 2) * multiplier;
  let primaryCount = Math.floor(budget / primaryCost);
  let remaining = budget - primaryCount * primaryCost;
  if (primaryCount === 0) {
    throw new RangeError(`本次 ${budget} 元预算不足以容纳一组 ${multiplier} 倍${additional ? "追加" : "普通"}投注，请调整倍数或追加设置。`);
  }
  // A single remaining yuan cannot buy a ticket; redistribute one primary group.
  if (remaining === 1) {
    primaryCount -= 1;
    remaining += primaryCost;
  }
  if (primaryCount < 1) {
    throw new RangeError(`本次 ${budget} 元无法在保留 ${multiplier} 倍${additional ? "追加" : "普通"}方案的同时正好用完，请调整倍数或追加设置。`);
  }

  const groups = Array.from({ length: primaryCount }, () => group(multiplier, additional, true));
  const remainingUsed = remaining;
  if (remaining % 2 !== 0) {
    if (game !== "dlt" || remaining < 3) throw new RangeError("当前预算无法按此组合正好用完。");
    groups.push(group(1, true, false));
    remaining -= 3;
  }
  for (; remaining > 0; remaining -= 2) groups.push(group(1, false, false));

  const totalCost = groups.reduce((sum, entry) => sum + entry.cost, 0);
  if (totalCost !== budget) throw new Error("预算校验失败，请重新选择方案。");
  const uniqueCount = groups.length;
  const perGroupTopProbability = game === "kl8"
    ? combinations(20, 8) / combinations(80, 8)
    : 1 / metadata.comboCount;
  const warnings = [];
  if (remainingUsed > 0) {
    warnings.push(`预算余额 ${remainingUsed} 元已配为 ${uniqueCount - primaryCount} 组单倍号码；各组倍数与追加情况见购票清单。`);
  }
  if (game === "kl8") {
    warnings.push("选八全中八的常规单倍奖金为 5 万元；触发官方赔付限额时奖金可能调整。不同组的中奖事件可能重叠，整单概率不能直接相加。");
  } else {
    warnings.push("一等奖奖金随当期开奖浮动；命中一等奖的概率不等于到手金额达到心愿的概率。");
  }

  const plan = {
    game, budget, multiplier, additional, target, totalCost, groups, uniqueCount,
    primaryCount, remainingUsed, remainingBudget: 0,
    requiredBasePrize: game === "kl8" ? null : requiredBasePrizeForTarget({ target, multiplier, additional }),
    perGroupTopProbability, warnings,
  };
  if (game !== "kl8") {
    plan.topPrizeProbability = uniqueCount / metadata.comboCount;
    // This deliberately generous bound concerns one winning group only. It is
    // constrained by the game's base-prize and total first-prize payout limits.
    plan.maxSingleGroupNetPrize = Math.max(...groups.map((entry) => netPrize(Math.min(
      metadata.maxTotalTopPrize,
      metadata.maxBaseTopPrize * entry.multiplier * (entry.additional ? 1.8 : 1),
    ))));
    plan.singleGroupTargetWithinCap = target <= plan.maxSingleGroupNetPrize;
    if (!plan.singleGroupTargetWithinCap) {
      warnings.push(`即使按单组一等奖常规最高估算，税后上界也只有 ${formatMoney(plan.maxSingleGroupNetPrize)} 元，无法由一组奖金独自覆盖 ${formatMoney(target)} 元的到手心愿（不计其他组奖金）。`);
    }
  }
  if (game === "kl8") {
    plan.fixedBaseTopPrize = metadata.fixedTopPrize;
    plan.maxSingleGroupNetPrize = netPrize(metadata.fixedTopPrize * Math.max(...groups.map((entry) => entry.multiplier)));
    // A conservative upper bound, not a promise that distinct groups can all win.
    plan.maxTicketNetPrize = netPrize(metadata.fixedTopPrize * groups.reduce((sum, entry) => sum + entry.multiplier, 0));
    plan.targetReachable = target <= plan.maxTicketNetPrize;
    if (!plan.targetReachable) {
      warnings.push(`按常规奖金，即使把整单各组都按全中八计算，税后上界也只有 ${formatMoney(plan.maxTicketNetPrize)} 元，无法覆盖 ${formatMoney(target)} 元的到手心愿。`);
    }
  }
  return plan;
}

/**
 * Deterministic, disclosed comparison policy, not a prediction or an optimum.
 * Floating jackpots use a 5-million-yuan scenario; KL8 uses its standard prize.
 * KL8's score may add overlapping events and must never be presented as odds.
 */
export function choosePlan({ budget, target = 0 }) {
  if (!Number.isInteger(budget) || budget < 2 || budget > 200) {
    throw new RangeError("本次预算请输入 2 至 200 元的整数。");
  }
  validateAmount(target, "到手目标");
  const candidates = [];
  const gameOrder = ["ssq", "dlt", "kl8"];
  for (const game of gameOrder) {
    const metadata = GAMES[game];
    const referenceBasePrize = game === "kl8" ? metadata.fixedTopPrize : 5000000;
    for (let multiplier = 1; multiplier <= Math.min(metadata.maxMultiplier, Math.floor(budget / 2)); multiplier += 1) {
      for (const additional of game === "dlt" ? [false, true] : [false]) {
        let plan;
        try { plan = buildPlan({ game, budget, target, multiplier, additional }); }
        catch (error) {
          if (error instanceof RangeError) continue;
          throw error;
        }
        const referenceNets = plan.groups.map((entry) => {
          const additionalPrize = entry.additional ? Math.floor(referenceBasePrize * 4 / 5) : 0;
          const gross = (referenceBasePrize + additionalPrize) * entry.multiplier;
          // Respect the existing total-first-prize cap even in this scenario.
          return netPrize(Math.min(metadata.maxTotalTopPrize ?? Infinity, gross));
        });
        const eligibleGroups = referenceNets.filter(net => net >= target).length;
        candidates.push({
          plan, referenceBasePrize, eligibleGroups,
          referenceMaxNetPrize: Math.max(...referenceNets),
          score: eligibleGroups * plan.perGroupTopProbability,
          configurationCount: new Set(plan.groups.map(entry => `${entry.multiplier}-${entry.additional}`)).size,
          gameOrder: gameOrder.indexOf(game),
        });
      }
    }
  }
  if (candidates.length === 0) throw new RangeError("当前预算无法组合出完整投注方案，请检查本次预算。");
  candidates.sort((first, second) => {
    const firstCovered = first.eligibleGroups > 0;
    const secondCovered = second.eligibleGroups > 0;
    if (firstCovered !== secondCovered) return firstCovered ? -1 : 1;
    if (firstCovered && first.score !== second.score) return second.score - first.score;
    if (!firstCovered && first.referenceMaxNetPrize !== second.referenceMaxNetPrize) return second.referenceMaxNetPrize - first.referenceMaxNetPrize;
    // Exact same budget throughout: break ties with simpler, fixed conventions.
    return first.configurationCount - second.configurationCount
      || first.plan.uniqueCount - second.plan.uniqueCount
      || first.plan.multiplier - second.plan.multiplier
      || Number(first.plan.additional) - Number(second.plan.additional)
      || first.gameOrder - second.gameOrder;
  });
  const selected = candidates[0];
  return {
    ...selected.plan,
    autoPolicy: {
      version: "budget-wish-reference-v1",
      referenceBasePrize: selected.referenceBasePrize,
      referenceKind: selected.plan.game === "kl8" ? "fixed-standard-prize" : "floating-prize-scenario",
      referenceMaxNetPrize: selected.referenceMaxNetPrize,
      eligibleGroups: selected.eligibleGroups,
      targetCoveredInReference: selected.eligibleGroups > 0,
      selectionScore: selected.score,
      selectionScoreIsProbability: false,
      usesGamePrizeCaps: true,
    },
  };
}

/** Uniform integer sampling: reject the incomplete remainder of uint32 space. */
export function randomIntBelow(bound, randomSource = globalThis.crypto) {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_SIZE) {
    throw new RangeError("随机整数范围必须在 1 至 2³² 之间。");
  }
  if (!randomSource || typeof randomSource.getRandomValues !== "function") {
    throw new Error("当前浏览器缺少安全随机数能力，请换用较新的浏览器。");
  }
  const limit = UINT32_SIZE - UINT32_SIZE % bound;
  const value = new Uint32Array(1);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    randomSource.getRandomValues(value);
    if (value[0] < limit) return value[0] % bound;
  }
  throw new Error("随机数源连续返回不可用值，请重试。");
}

function drawNumbers(count, range, source) {
  const pool = Array.from({ length: range }, (_, index) => index + 1);
  for (let index = 0; index < count; index += 1) {
    const other = index + randomIntBelow(range - index, source);
    [pool[index], pool[other]] = [pool[other], pool[index]];
  }
  return pool.slice(0, count).sort((first, second) => first - second);
}

/** Every group receives a distinct complete combination; repeats are resampled. */
export function generateEntries(plan, randomSource = globalThis.crypto) {
  const metadata = getGame(plan.game);
  if (!Array.isArray(plan.groups) || plan.groups.length < 1 || plan.groups.length > 100) {
    throw new RangeError("选号方案缺少有效的购票分组。");
  }
  const used = new Set();
  return plan.groups.map((entry) => {
    for (let attempt = 0; attempt < 1024; attempt += 1) {
      const main = drawNumbers(metadata.mainCount, metadata.mainMax, randomSource);
      const special = drawNumbers(metadata.specialCount, metadata.specialMax, randomSource);
      const key = `${main.join(",")}/${special.join(",")}`;
      if (!used.has(key)) {
        used.add(key);
        return { ...entry, game: plan.game, main, special };
      }
    }
    throw new Error("随机数源未能生成不同的号码组合，请重新签发。");
  });
}

function formatMoney(value) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatNumbers(numbers) {
  return numbers.map((number) => String(number).padStart(2, "0")).join(" ");
}

export function formatEntry(entry, game = entry.game, index = 0) {
  const metadata = getGame(game);
  const parts = [`${index + 1}. ${metadata.mainLabel} ${formatNumbers(entry.main)}`];
  if (metadata.specialCount > 0) parts.push(`${metadata.specialLabel} ${formatNumbers(entry.special)}`);
  parts.push(`${entry.multiplier} 倍${entry.additional ? "，追加" : ""}，${entry.cost} 元`);
  return parts.join("｜");
}

export function formatPlanInstruction(plan) {
  const metadata = getGame(plan.game);
  const counts = new Map();
  for (const entry of plan.groups) {
    const key = `${entry.multiplier} 倍${entry.additional ? "追加" : "普通"}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const allocation = [...counts].map(([kind, count]) => `${count} 组 ${kind}`).join("，");
  return `${metadata.name}，单式，${allocation}，合计 ${plan.totalCost} 元。请按清单中的号码、倍数和追加情况出票。`;
}
