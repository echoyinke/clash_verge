// ============================================================================
// Clash Verge 脚本扩展 —— 区域内自动
//   按节点名把节点分到各区域，各建一个 url-test 自动组（如 🇺🇸 美国自动），
//   再把这些区域组作为选项，插进白名单组的「🎯 全球直连」之后。
//   规则分流已在 Merge.yaml，本脚本只管分组。订阅每次更新重跑，幂等。
// ============================================================================

// 区域组：name=组名，patterns=命中任一即归入。增删区域改这张表。
const REGIONS = [
  { name: "🇭🇰 香港自动", patterns: [/香港/, /Hong\s*Kong/i, /\bHK\b/i] },
  { name: "🇨🇳 台湾自动", patterns: [/台湾/, /Taiwan/i, /\bTW\b/i] },
  { name: "🇸🇬 狮城自动", patterns: [/狮城/, /新加坡/, /Singapore/i, /\bSG\b/i] },
  { name: "🇯🇵 日本自动", patterns: [/日本/, /Japan/i, /\bJP\b/i] },
  { name: "🇺🇸 美国自动", patterns: [/美国/, /United\s*States/i, /\bUS\b/i, /\bUSA\b/i] },
  { name: "🇲🇾 马来西亚自动", patterns: [/马来西亚/, /Malaysia/i, /\bMY\b/i] },
];

const INSERT_INTO = ["🔰 节点选择", "🐟 漏网之鱼"]; // 区域组插进这些组
const INSERT_AFTER = "🎯 全球直连";                  // 插在此选项之后
const TEST_URL = "https://www.gstatic.com/generate_204";

function main(config) {
  const groups = config["proxy-groups"] || [];
  const names = (config.proxies || []).map((p) => p.name).filter(Boolean);

  // 1. 建区域自动组
  const created = [];
  for (const { name, patterns } of REGIONS) {
    const proxies = names.filter((n) => patterns.some((re) => re.test(n)));
    if (proxies.length === 0) continue;
    upsert(groups, { name, type: "url-test", url: TEST_URL, interval: 300, tolerance: 100, proxies });
    created.push(name);
  }

  // 2. 插进白名单组的「全球直连」之后
  for (const name of INSERT_INTO) {
    const group = groups.find((g) => g.name === name);
    if (group && Array.isArray(group.proxies)) insertAfter(group, created);
  }

  config["proxy-groups"] = groups;
  return config;
}

// 有同名组则覆盖字段，否则追加（幂等，避免重复建组）
function upsert(groups, group) {
  const i = groups.findIndex((g) => g.name === group.name);
  if (i >= 0) groups[i] = { ...groups[i], ...group };
  else groups.push(group);
}

// 把 options 插到 INSERT_AFTER 之后；先删后加，反复执行不累积重复
function insertAfter(group, options) {
  if (options.length === 0) return;
  const list = group.proxies.filter((n) => !options.includes(n));
  const at = list.indexOf(INSERT_AFTER) + 1; // 找不到返回 -1，+1=0 插到最前
  group.proxies = [...list.slice(0, at), ...options, ...list.slice(at)];
}
