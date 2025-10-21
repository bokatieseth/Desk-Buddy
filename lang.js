// Bilingual UI strings for 工位萌伴园
const LANG = {
  appTitle: "工位萌伴园 Gongwei Buddy Garden",
  tabToday: "今日任务 Today",
  tabBinder: "收藏册 Binder",
  tabDesk: "桌面展示 Desk",
  tabSettings: "设置 Settings",
  clockIn: "打卡 Clock In",
  tasks: "任务 Tasks",
  addTask: "添加任务 Add",
  clockInHint: "打卡即送1个盲盒 | Clock in grants 1 blind box",
  progressHint: "为大型任务设定“今日目标百分比”；达到目标计为完成。Set a daily target percent for big tasks; reaching it counts as done today.",
  endRules: "规则：打卡即送1个；全完成得2个；部分完成得1个；未完成得0个。Clock-in=+1; all done=+2; some done=+1; none=0.",
  demo: "演示 Demo",
  about: "关于 About"
};

function applyLang(){
  const map = {
    appTitle: "t-appTitle",
    tabToday: "t-tabToday",
    tabBinder: "t-tabBinder",
    tabDesk: "t-tabDesk",
    tabSettings: "t-tabSettings",
    clockIn: "t-clockIn",
    tasks: "t-tasks",
    addTask: "t-addTask",
    clockInHint: "t-clockInHint",
    progressHint: "t-progressHint",
    endRules: "t-endRules",
    demo: "t-demo",
    about: "t-about"
  };
  Object.entries(map).forEach(([k,id]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = LANG[k];
  });
}
document.addEventListener('DOMContentLoaded', applyLang);
window.L = {
  'tab.today': '今日任务',
  'tab.binder': '收藏册',
  'tab.desk': '桌面展示',
  'tab.settings': '设置',
  'today.clockIn': '打卡 Clock In',
  'today.clockInHint': '打卡即送1个盲盒 | Clock in grants 1 blind box',
  'today.tasks': '任务 Tasks',
  'today.addTask': '添加任务 Add',
  'today.progressHint': '为大型任务设定“今日目标百分比”；达到目标计为完成。',
  'today.endRules': '规则：打卡即送1个； 全完成得2个； 部分完成得1个； 未完成得0个。',
  'binder.empty': '还没有收藏哦 No collectibles yet',
  'endday.openBoxes': '结束一天并开启 {n} 个盲盒',
  'endday.ended': '今天已收工（明天再来）',
  'endday.noBoxes': '今天没有可开启的盲盒',
  'dev.timeModeHint': '当前为“模拟时间”模式：请在设置页或左下角小按钮中恢复系统时间以进入新的一天。',
  'clockin.tooEarly': '每天 6:00 之后才能打卡 / Clock-in opens at 6:00 AM',
  'task.add.afterEnded': '今天已收工，新任务将进入待办（可明日补领奖励）',
  'confirm.endEarly': '现在尚未到 16:00，确定要收工吗？请确认今日任务已完成。',
  'confirm.progress': '「{title}」{date}进展顺利吗？\n确定 = 顺利 / 取消 = 未完成',
  'desk.hint': '从收藏选择3个展示到“工位”。',
  'desk.selectFirst': '先从下拉选择一个收藏',
  'desk.noCopies': '该藏品没有可用副本可放置',
  'desk.empty': '空 Empty',
  'reveal.title': '获得新藏品！'
};
