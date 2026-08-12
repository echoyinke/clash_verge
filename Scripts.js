// ============================================================================
// Clash Verge Script
// 只添加区域自动测速组，其他订阅原生配置保持不变
// ============================================================================

const REGIONS = [
  { name: "🇭🇰 香港自动", patterns: [/^HK[-_ ]/i, /香港/, /Hong\s*Kong/i, /\bHK\b/i] },
  { name: "🇨🇳 台湾自动", patterns: [/^TW[-_ ]/i, /台湾/, /Taiwan/i, /\bTW\b/i] },
  { name: "🇯🇵 日本自动", patterns: [/^JP[-_ ]/i, /日本/, /Japan/i, /\bJP\b/i] },
  { name: "🇺🇸 美国自动", patterns: [/^US[-_ ]/i, /美国/, /United\s*States/i, /\bUS\b/i, /\bUSA\b/i] },
  { name: "🇸🇬 狮城自动", patterns: [/^SG[-_ ]/i, /新加坡/, /狮城/, /Singapore/i, /\bSG\b/i] },
  { name: "🇲🇾 马来西亚自动", patterns: [/^MY[-_ ]/i, /马来西亚/, /Malaysia/i, /\bMY\b/i] },
  { name: "🇰🇷 韩国自动", patterns: [/^KR[-_ ]/i, /韩国/, /Korea/i, /\bKR\b/i] },
  { name: "🇬🇧 英国自动", patterns: [/^UK[-_ ]/i, /^GB[-_ ]/i, /英国/, /United\s*Kingdom/i, /\bUK\b/i, /\bGB\b/i] },
  { name: "🇨🇦 加拿大自动", patterns: [/^CA[-_ ]/i, /加拿大/, /Canada/i, /\bCA\b/i] },
  { name: "🇦🇺 澳大利亚自动", patterns: [/^AU[-_ ]/i, /澳大利亚/, /Australia/i, /\bAU\b/i] },
];

const TEST_URL = "https://www.gstatic.com/generate_204";

const INFO_NODE_PATTERNS = [
  /剩余流量/,
  /下次重置/,
  /套餐到期/,
  /官网/,
  /更新订阅/,
  /过期/,
  /Expire/i,
  /Traffic/i,
  /Reset/i,
];

function main(config) {

  const groups = config["proxy-groups"] || [];

  const nodes = (config.proxies || [])
    .map(p => p.name)
    .filter(isUsableNode);

  for (const region of REGIONS) {

    const matched = nodes.filter(name =>
      region.patterns.some(r => r.test(name))
    );

    if (!matched.length) continue;


    upsert(groups, {
      name: region.name,
      type: "url-test",
      url: TEST_URL,
      interval: 300,
      tolerance: 80,
      proxies: matched
    });
  }

  config["proxy-groups"] = groups;

  return config;
}

function isUsableNode(name) {
  return Boolean(name) && !INFO_NODE_PATTERNS.some(r => r.test(name));
}

// 同名覆盖
function upsert(groups, group) {

  const index = groups.findIndex(
    g => g.name === group.name
  );


  if (index >= 0) {
    groups[index] = {
      ...groups[index],
      ...group
    };
  } else {
    groups.push(group);
  }

}
