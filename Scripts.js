// ============================================================================
// Clash Verge 「脚本扩展」入口
//
// 功能：实现「区域内自动」——按节点名把节点分到各区域，每个区域建一个
//       url-test 自动测速组（如 🇺🇸 美国自动），再把这些区域组作为可选项
//       塞进所有可手动选择（select 类型）的代理组里。
//
// 执行时机：Clash Verge 先应用 Merge.yaml，再执行本脚本；脚本拿到的是
//           订阅解析并合并后的整份配置对象 config。订阅每次更新都会重跑。
//
// 约定：必须导出 main(config, profileName)，在里面就地修改 config 后 return，
//       mihomo 就用改过的这份配置运行。
// ============================================================================

/**
 * 脚本主函数（Clash Verge 规定的入口）。
 * @param {object} config       整份配置：含 proxies / proxy-groups / rules 等
 * @param {string} profileName  当前订阅名（本脚本没用到）
 * @returns {object}            修改后的 config
 */
function main(config, profileName) {
  // 取出节点列表和代理组列表；|| [] 兜底，防止字段缺失时后面报错
  const proxies = config.proxies || [];
  const groups = config["proxy-groups"] || [];

  // --------------------------------------------------------------------------
  // 区域定义表：一张「区域 -> 如何识别 + 如何建组」的映射。
  //   name       ：要生成的组名
  //   tolerance  ：url-test 容差(毫秒)。只有别的节点比当前节点快「超过」这个
  //                值才切换，用来抑制来回横跳。美国跨太平洋抖动大，给 250；
  //                亚洲近距离线路稳定，给 150。
  //   patterns   ：一组正则，命中「任意一个」即认为该节点属于此区域。
  //                /.../i 表示忽略大小写；\s* 匹配 0~多个空格（兼容
  //                "United States" / "UnitedStates"）；\b 是单词边界，
  //                \bUS\b 只匹配独立的 "US"，不会误伤 "USA" 或 "August"。
  // 想加/改区域，改这张表即可，下面的逻辑全自动适配。
  // --------------------------------------------------------------------------
  const regionDefs = [
    { name: "🇭🇰 香港自动", tolerance: 150, patterns: [/香港/, /Hong\s*Kong/i, /\bHK\b/i] },
    { name: "🇨🇳 台湾自动", tolerance: 150, patterns: [/台湾/, /Taiwan/i, /\bTW\b/i] },
    { name: "🇸🇬 狮城自动", tolerance: 150, patterns: [/狮城/, /新加坡/, /Singapore/i, /\bSG\b/i] },
    { name: "🇯🇵 日本自动", tolerance: 150, patterns: [/日本/, /Japan/i, /\bJP\b/i] },
    { name: "🇺🇸 美国自动", tolerance: 250, patterns: [/美国/, /United\s*States/i, /\bUS\b/i, /\bUSA\b/i] },
    { name: "🇲🇾 马来西亚自动", tolerance: 150, patterns: [/马来西亚/, /Malaysia/i, /\bMY\b/i] },
  ];

  // 把节点对象数组映射成「节点名」字符串数组；filter(Boolean) 去掉空名字。
  const proxyNames = proxies.map((proxy) => proxy.name).filter(Boolean);

  // 记录「实际建成功」的区域组名（有匹配到节点的才算），第 2 步插入时要用。
  const regionGroupNames = [];

  // --------------------------------------------------------------------------
  // 第 1 步：为每个区域生成一个 url-test 自动组
  // --------------------------------------------------------------------------
  for (const region of regionDefs) {
    // 从所有节点名里，挑出「命中该区域任一正则」的节点。
    const matched = proxyNames.filter((name) =>
      region.patterns.some((pattern) => pattern.test(name))
    );

    // 这个区域一个节点都没匹配到，就不建空组，直接跳过。
    if (matched.length === 0) {
      continue;
    }

    // 建组（或覆盖同名组）。type: "url-test" 表示 mihomo 每隔 interval 秒
    // 访问 url 测各节点延迟，自动选最快的——这就是「区域内自动」的核心。
    // url 用 generate_204：一个只返回空 204 响应的轻量测速端点。
    upsertGroup(groups, {
      name: region.name,
      type: "url-test",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: region.tolerance,
      proxies: matched,
    });

    regionGroupNames.push(region.name);
  }

  // --------------------------------------------------------------------------
  // 第 2 步：把这些区域组，作为可选项加进所有可手动选择的代理组
  // --------------------------------------------------------------------------
  insertOptionsToAllSelectGroups(groups, regionGroupNames);

  // 写回并返回（groups 是引用，通常已就地改好，这里显式赋值更清晰）。
  config["proxy-groups"] = groups;
  return config;
}

/**
 * upsert = update + insert：有同名组就用新字段覆盖，没有就追加。
 * 作用是幂等兜底——即使订阅里已存在同名组，也不会建出两个重复组。
 * @param {Array}  groups     代理组数组（会被就地修改）
 * @param {object} nextGroup  要写入的组定义
 */
function upsertGroup(groups, nextGroup) {
  // 按组名找是否已存在。
  const index = groups.findIndex((group) => group.name === nextGroup.name);
  if (index >= 0) {
    // 已存在：{ ...旧, ...新 } 对象展开合并，新字段覆盖旧字段。
    groups[index] = { ...groups[index], ...nextGroup };
    return;
  }
  // 不存在：追加到末尾。
  groups.push(nextGroup);
}

/**
 * 遍历所有代理组，把区域组选项插进「可手动选择」的那些组里。
 * @param {Array} groups   全部代理组
 * @param {Array} options  要插入的区域组名数组
 */
function insertOptionsToAllSelectGroups(groups, options) {
  // 没有任何区域组（比如订阅里一个能识别的节点都没有），直接返回。
  if (options.length === 0) {
    return;
  }

  for (const group of groups) {
    // 只处理 select（手动选择）组。url-test / fallback 等自动组自己按延迟
    // 选节点，塞选项没意义，跳过。顺带排除 proxies 不是数组的异常组。
    if (group.type !== "select" || !Array.isArray(group.proxies)) {
      continue;
    }

    // 跳过区域组自身，避免「美国自动」的选项里出现「美国自动」这种自引用。
    if (options.includes(group.name)) {
      continue;
    }

    // 锚点：把区域组插在这几个「头部控制项」之后（详见 insertOptions 注释）。
    insertOptions(group, options, ["🔰 节点选择", "♻️ 自动选择", "🎯 全球直连"]);
  }
}

/**
 * 把 options 插入到某个组的 proxies 列表中，位置在 anchors 之后。
 * 关键特性：先删后加，保证脚本反复执行也不会累积重复项（幂等）。
 * @param {object} group    单个代理组（会被就地修改）
 * @param {Array}  options  要插入的选项（区域组名）
 * @param {Array}  anchors  定位锚点：插在这些选项中「最靠后那个」的后面
 */
function insertOptions(group, options, anchors) {
  // ① 先把 options 从原列表里滤掉。这样即使上次已经插过，也会先清干净，
  //    避免订阅每次更新重跑脚本时不断累积重复选项。
  const original = group.proxies.filter((name) => !options.includes(name));

  // ② 计算插入位置：在所有锚点里找「位置最靠后」的那个，插到它后面。
  //    取最大位置是为了兼容不同组的头部结构（锚点有无、顺序都可能不同），
  //    确保区域组落在全部头部控制项之后。一个锚点都没找到时 insertAt 保持
  //    0，退化为插到最前面（优雅降级，不报错）。
  let insertAt = 0;
  for (const anchor of anchors) {
    const pos = original.indexOf(anchor);
    if (pos >= insertAt) {
      insertAt = pos + 1;
    }
  }

  // ③ 三段切片拼接：[锚点及之前] + [区域组] + [其余裸节点]。
  group.proxies = [
    ...original.slice(0, insertAt),
    ...options,
    ...original.slice(insertAt),
  ];
}
