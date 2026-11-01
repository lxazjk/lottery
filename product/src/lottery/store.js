import { reactive } from "vue";

export const state = reactive({
  ready: false,
  error: "",
  prizes: [],
  records: [],
  absentRecords: [],
  activityId: null,
  revision: 0,
  range: { start: 1, end: 200 },
  currentType: 4,
  phase: "idle",
  winner: null,
  qipaoList: [],
});

export function applySnapshot(data) {
  state.activityId = data.activityId;
  state.revision = data.revision;
  state.prizes = data.cfgData.prizes;
  state.range = data.cfgData.numberRange;
  state.records = data.records;
  state.absentRecords = data.absentRecords || [];
}

export function nextPrize() {
  return [...state.prizes]
    .reverse()
    .find(
      (prize) =>
        state.records.filter((row) => row.type === prize.type).length <
        prize.count,
    );
}

let sequence = 0;
export function pushQipao(text) {
  const item = { id: ++sequence, text };
  state.qipaoList.push(item);
  window.setTimeout(() => {
    state.qipaoList = state.qipaoList.filter((row) => row.id !== item.id);
  }, 5000);
}
