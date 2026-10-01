import localizedNames from './data/localizedNames.json'
import { usePlannerStore } from './store'
import type { Language } from './language'
import type { Item, Recipe } from './types'

const zh = {
  appName: 'Endfield-Informed Neural Networks', appSubtitle: '稳态计算图', products: '产物', recipes: '配方', unitMinute: '单位 / 分', perMinute: '/ 分', currentGraph: '当前图',
  allGraph: '全图', targetGraph: '目标相关', power: '耗电', generation: '发电', vouchers: '武陵调度券', emptyGraph: '添加并启用目标后显示相关产线',
  productIndex: '产物索引', searchPlaceholder: '搜索名称、拼音首字母或 ID', disableProduction: '禁用生产', enableProduction: '恢复生产', disabledMark: '禁',
  goals: '优化目标', targetNet: '目标净输出', equalsPerMinute: '等于 · 数量 / 分', addTarget: '添加为目标', unavailable: '不可用', unavailableTitle: '当前无可用来源，暂不参与求解', removeTarget: '移除目标',
  powerWeight: '耗电权重', voucherWeight: '调度券权重', powerWeightTitle: '总耗电最小化权重', voucherWeightTitle: '武陵调度券最大化权重',
  externalLimits: '外部输入上限', amountPerMinute: '数量 / 分', inputLimit: '输入上限',
  balance: '配平', reset: '重置', run: '运行', running: '运行中…', steps: '步数', runSteps: '本次运行步数', cumulative: '累计', learningRate: '学习率',
  targetResults: '目标结果', totalPower: '总耗电', totalGeneration: '总发电', totalLoss: '总损失', lossDetails: '损失明细', total: '总计', loss: '损失',
  powerLoss: '耗电量', voucherGain: '调度券收益', implicitBalance: '未设目标净输出 = 0', shortage: '供料不足', supplyOver: '外部输入超限', ovenOver: '天有洪炉超限', otherPenalty: '其他惩罚',
  chartMetric: '绘制', history: '历史', every1k: '每 1k 步', chartLabel: '配平历史折线图', stepUnit: '步', selectChart: '勾选数据以绘图', chartAfter1k: '运行至 1k 步后显示',
  input: '入', output: '出', net: '净', sourceIncluded: '含外部输入', machine: '装置', condition: '条件', factor: '倍率', recipeUnit: '份配方效率', perMachine: '/ 分 / 台', powerPerRecipe: '/份', duration: '耗时', secondsEach: '秒/次',
  focus: '聚焦', clear: '清空', optimizeLayout: '优化排布', fitGraph: '适配全图', opacity: '透明度', threshold: '阈值', lowFlowOpacity: '低流量透明度', lowFlowThreshold: '低流量阈值', gasEffect: '效果',
  statusReady: '设置目标后开始求解', statusGoalChanged: '目标已更改，可继续配平', statusSettingsChanged: '设置已更改，可继续配平', statusReset: '已重置', statusComplete: '求解完成 · 约束已满足', statusEnded: '已结束', statusUnmet: '项约束未满足', statusProgress: '迭代', statusFailed: '求解失败',
} as const

type Key = keyof typeof zh

const en: Record<Key, string> = {
  appName: 'Endfield-Informed Neural Networks', appSubtitle: 'Steady-state graph', products: 'Items', recipes: 'Recipes', unitMinute: 'Units / min', perMinute: '/ min', currentGraph: 'Current graph',
  allGraph: 'All', targetGraph: 'Targets', power: 'Power', generation: 'Generation', vouchers: 'Wuling Stock Bills', emptyGraph: 'Add an enabled target to show its production graph',
  productIndex: 'Item index', searchPlaceholder: 'Search name, pinyin initials or ID', disableProduction: 'Disable production', enableProduction: 'Enable production', disabledMark: 'Off',
  goals: 'Optimization goals', targetNet: 'Target net output', equalsPerMinute: 'equals · units / min', addTarget: 'Add as target', unavailable: 'Unavailable', unavailableTitle: 'No available source; excluded from solving', removeTarget: 'Remove target',
  powerWeight: 'Power weight', voucherWeight: 'Stock Bill weight', powerWeightTitle: 'Minimize power consumption', voucherWeightTitle: 'Maximize Wuling Stock Bills',
  externalLimits: 'External input limits', amountPerMinute: 'Units / min', inputLimit: 'Input limit',
  balance: 'Solve', reset: 'Reset', run: 'Run', running: 'Running…', steps: 'Steps', runSteps: 'Steps this run', cumulative: 'Total', learningRate: 'Learning rate',
  targetResults: 'Results', totalPower: 'Power used', totalGeneration: 'Power generated', totalLoss: 'Total loss', lossDetails: 'Loss breakdown', total: 'Total', loss: 'loss',
  powerLoss: 'Power', voucherGain: 'Stock Bill gain', implicitBalance: 'Unspecified net output = 0', shortage: 'Input shortage', supplyOver: 'External input over limit', ovenOver: 'Forge of the Sky over limit', otherPenalty: 'Other penalties',
  chartMetric: 'Plot', history: 'History', every1k: 'Every 1k steps', chartLabel: 'Solver history line chart', stepUnit: 'steps', selectChart: 'Select metrics to plot', chartAfter1k: 'Run 1k steps to show history',
  input: 'In', output: 'Out', net: 'Net', sourceIncluded: 'incl. external input', machine: 'Machine', condition: 'Condition', factor: 'Rate', recipeUnit: 'recipe equivalents', perMachine: '/ min / machine', powerPerRecipe: '/recipe', duration: 'Duration', secondsEach: 's/cycle',
  focus: 'Focus', clear: 'Clear', optimizeLayout: 'Optimize layout', fitGraph: 'Fit graph', opacity: 'Opacity', threshold: 'Threshold', lowFlowOpacity: 'Low-flow opacity', lowFlowThreshold: 'Low-flow threshold', gasEffect: ' effect',
  statusReady: 'Set a target to start solving', statusGoalChanged: 'Goal changed; continue solving', statusSettingsChanged: 'Settings changed; continue solving', statusReset: 'Reset', statusComplete: 'Solved · constraints satisfied', statusEnded: 'Finished', statusUnmet: 'constraints unmet', statusProgress: 'Iteration', statusFailed: 'Solver failed',
}

const ja: Record<Key, string> = {
  appName: 'Endfield-Informed Neural Networks', appSubtitle: '定常状態の計算グラフ', products: '産物', recipes: 'レシピ', unitMinute: '単位 / 分', perMinute: '/ 分', currentGraph: '表示中',
  allGraph: '全体', targetGraph: '目標関連', power: '消費電力', generation: '発電量', vouchers: '武陵取引券', emptyGraph: '目標を追加して有効にすると関連ラインを表示します',
  productIndex: '産物一覧', searchPlaceholder: '名前・ピンイン頭文字・IDで検索', disableProduction: '生産を無効化', enableProduction: '生産を有効化', disabledMark: '禁',
  goals: '最適化目標', targetNet: '正味産出目標', equalsPerMinute: '等しい · 数量 / 分', addTarget: '目標に追加', unavailable: '利用不可', unavailableTitle: '利用可能な供給源がないため計算から除外', removeTarget: '目標を削除',
  powerWeight: '消費電力の重み', voucherWeight: '取引券の重み', powerWeightTitle: '総消費電力を最小化', voucherWeightTitle: '武陵取引券を最大化',
  externalLimits: '外部入力上限', amountPerMinute: '数量 / 分', inputLimit: '入力上限',
  balance: '計算', reset: 'リセット', run: '実行', running: '実行中…', steps: 'ステップ', runSteps: '今回のステップ数', cumulative: '累計', learningRate: '学習率',
  targetResults: '目標の結果', totalPower: '総消費電力', totalGeneration: '総発電量', totalLoss: '総損失', lossDetails: '損失の内訳', total: '合計', loss: '損失',
  powerLoss: '消費電力', voucherGain: '取引券の収益', implicitBalance: '目標外の正味産出 = 0', shortage: '供給不足', supplyOver: '外部入力の上限超過', ovenOver: '天有洪炉の上限超過', otherPenalty: 'その他のペナルティ',
  chartMetric: '描画', history: '履歴', every1k: '1k ステップごと', chartLabel: '計算履歴の折れ線グラフ', stepUnit: 'ステップ', selectChart: '描画する項目を選択', chartAfter1k: '1k ステップ実行後に表示',
  input: '入', output: '出', net: '差', sourceIncluded: '外部入力を含む', machine: '設備', condition: '条件', factor: '倍率', recipeUnit: 'レシピ相当', perMachine: '/ 分 / 台', powerPerRecipe: '/レシピ', duration: '所要時間', secondsEach: '秒/回',
  focus: 'フォーカス', clear: 'クリア', optimizeLayout: '配置を最適化', fitGraph: '全体を表示', opacity: '透明度', threshold: '閾値', lowFlowOpacity: '低流量の透明度', lowFlowThreshold: '低流量の閾値', gasEffect: '効果',
  statusReady: '目標を設定して計算を開始', statusGoalChanged: '目標を変更しました。計算を続行できます', statusSettingsChanged: '設定を変更しました。計算を続行できます', statusReset: 'リセット済み', statusComplete: '計算完了 · 制約を満たしています', statusEnded: '終了', statusUnmet: '件の制約が未達成', statusProgress: '反復', statusFailed: '計算エラー',
}

const ui = { zh, en, ja } as const
const itemNames = localizedNames.items as Record<string, { en: string; ja: string }>
const machineNames = localizedNames.machines as Record<string, { en: string; ja: string }>

export function useI18n() {
  const language = usePlannerStore((state) => state.language)
  const t = (key: Key) => ui[language][key]
  const itemName = (item: Pick<Item, 'id' | 'name'>): string => {
    if (language === 'zh') return item.name
    if (item.id.startsWith('effect:')) {
      const gas = itemNames[item.id.slice('effect:'.length)]?.[language]
      return gas ? `${gas}${t('gasEffect')}` : item.name
    }
    return itemNames[item.id]?.[language] ?? item.name
  }
  const machineName = (recipe: Pick<Recipe, 'machineId' | 'machineName'>) => language === 'zh' ? recipe.machineName : machineNames[recipe.machineId]?.[language] ?? recipe.machineName
  const number = (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString({ zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' }[language], options)
  return { language, t, itemName, machineName, number }
}

export function localizeStatus(status: string, language: Language): string {
  const t = (key: Key) => ui[language][key]
  const known: Record<string, Key> = {
    '设置目标后开始求解': 'statusReady', '目标已更改，可继续配平': 'statusGoalChanged', '设置已更改，可继续配平': 'statusSettingsChanged',
    '已重置': 'statusReset', '求解完成 · 约束已满足': 'statusComplete', '运行中…': 'running',
  }
  if (known[status]) return t(known[status])
  const ended = /^已结束；(\d+) 项约束未满足$/.exec(status)
  if (ended) return `${t('statusEnded')} · ${ended[1]} ${t('statusUnmet')}`
  const progress = /^迭代 (.+) \/ (.+) · 损失 (.+)$/.exec(status)
  if (progress) return `${t('statusProgress')} ${progress[1]} / ${progress[2]} · ${t('loss')} ${progress[3]}`
  if (status.startsWith('求解失败：')) return `${t('statusFailed')}: ${status.slice('求解失败：'.length)}`
  return status
}
