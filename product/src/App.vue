<template>
  <div
    class="event-app"
    :class="['phase-' + state.phase, { 'has-dialog': dialog }]"
  >
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>
    <div class="grain"></div>
    <header class="topbar">
      <a class="brand" href="/" aria-label="幸运盛典首页" @click.prevent>
        <span class="brand-mark"><Icon name="sparkle" /></span>
        <span>幸运盛典<small>THE LUCKY MOMENT</small></span>
      </a>
      <span class="event-label">每一个号码，都值得一份惊喜</span>
      <div class="header-actions">
        <button
          class="text-button history-button"
          @click="openDialog('results')"
          :disabled="busy"
        >
          <Icon name="list" /><span>中奖名单</span
          ><b v-if="state.records.length">{{ state.records.length }}</b>
        </button>
        <span class="action-divider"></span>
        <button
          class="icon-button"
          :class="{ enabled: musicOn }"
          @click="toggleMusic"
          :aria-label="musicOn ? '关闭音乐' : '开启音乐'"
          :title="musicOn ? '关闭音乐' : '开启音乐'"
        >
          <Icon :name="musicOn ? 'music' : 'mute'" />
        </button>
        <button
          class="icon-button fullscreen-button"
          @click="toggleFullscreen"
          aria-label="切换全屏"
          title="全屏 · F"
        >
          <Icon name="full" />
        </button>
      </div>
    </header>

    <main v-if="state.ready" class="event-main">
      <aside class="prize-rail">
        <div class="rail-heading">
          <span>今夜的幸运</span>
          <button
            class="text-button prize-preview-trigger"
            @click="openPrizePreview()"
            :disabled="busy"
            aria-haspopup="dialog"
          >
            <Icon name="gift" />查看奖品
          </button>
        </div>
        <div class="prize-stack">
          <button
            v-for="(prize, index) in state.prizes"
            :key="prize.type"
            class="award-row"
            :class="{
              selected: prize.type === state.currentType,
              completed: remaining(prize) === 0,
            }"
            :disabled="busy || remaining(prize) === 0"
            @click="selectPrize(prize)"
            :aria-pressed="prize.type === state.currentType"
          >
            <span class="award-emblem"
              ><Icon :name="['crown', 'trophy', 'medal', 'star'][index]"
            /></span>
            <span class="award-copy"
              ><small>{{ prize.label }}</small
              ><strong>{{ prize.text }}</strong>
              <span class="award-meta"
                ><span v-if="remaining(prize) === 0"
                  ><Icon name="check" /> 已揭晓</span
                ><span v-else>共 {{ prize.count }} 个名额</span
                ><b
                  >{{ countFor(prize.type) }}<i> / {{ prize.count }}</i></b
                ></span
              >
            </span>
            <span class="active-indicator"></span>
          </button>
        </div>
        <div class="rail-note">
          <Icon name="sparkle" />
          <p>8 份幸运<br /><span>等待 8 位主角</span></p>
        </div>
      </aside>

      <section class="draw-stage" aria-label="抽奖舞台">
        <div class="stage-heading">
          <div class="eyebrow">
            <span></span
            >{{ allDone ? "ALL THE LUCKY ONES" : currentPrize?.label }}
          </div>
          <h1>
            {{
              state.phase === "result"
                ? "这一刻，幸运属于你。"
                : allDone
                  ? "每一份幸运，都已抵达。"
                  : "好运，即刻发生。"
            }}
          </h1>
          <p v-if="allDone && state.phase !== 'result'">
            感谢每一位参与者，愿惊喜常伴。
          </p>
          <p v-else>
            本轮抽取 <strong>{{ currentPrize?.text }}</strong
            ><span class="dot-separator">·</span
            >{{ remaining(currentPrize) }} 个名额待揭晓
          </p>
        </div>

        <div
          class="sphere-stage"
          :class="{ 'winner-visible': state.phase === 'result' }"
        >
          <span class="stage-corner corner-tl">LUCK IS IN THE AIR</span>
          <span class="stage-corner corner-tr"
            ><i></i
            >{{
              state.phase === "spinning"
                ? "DRAWING LIVE"
                : state.phase === "result"
                  ? "LUCKY ONE FOUND"
                  : "READY FOR A SURPRISE"
            }}</span
          >
          <div class="orbital orbital-one"></div>
          <div class="orbital orbital-two"></div>
          <div class="orbital-point point-one"></div>
          <div class="orbital-point point-two"></div>
          <div class="sphere-glow"></div>
          <div ref="stageEl" class="number-scene" :aria-hidden="true"></div>
          <div v-if="state.phase === 'spinning'" class="rolling-label">
            <span></span>好运正在流转<span></span>
          </div>
          <Transition name="reveal">
            <div
              v-if="state.phase === 'result'"
              class="winner-reveal"
              aria-live="polite"
            >
              <div class="winner-caption">
                <Icon name="sparkle" /><span>CONGRATULATIONS</span
                ><Icon name="sparkle" />
              </div>
              <div class="winner-number">{{ format(state.winner.number) }}</div>
              <div class="winner-description">
                恭喜 {{ format(state.winner.number) }} 号 · 获得{{
                  prizeName(state.winner.type)
                }}
              </div>
              <div class="winner-line"></div>
            </div>
          </Transition>
          <div
            v-if="allDone && state.phase !== 'result'"
            class="completion-display"
          >
            <Icon name="crown" /><strong>圆满开奖</strong
            ><span>8 位幸运主角，全部揭晓</span>
          </div>
          <div v-if="celebrating" class="confetti" aria-hidden="true">
            <i v-for="i in 36" :key="i" :style="confettiStyle(i)"></i>
          </div>
          <span class="stage-corner corner-bl">001 — 200</span>
          <span class="stage-corner corner-br">每个号码，仅中奖一次</span>
        </div>

        <div class="draw-controls">
          <button
            class="primary-button"
            :class="{ 'stop-button': state.phase === 'spinning' }"
            @click="primaryAction"
            :disabled="state.phase === 'revealing'"
          >
            <span class="button-glint"></span
            ><Icon
              :name="
                state.phase === 'spinning'
                  ? 'stop'
                  : state.phase === 'result'
                    ? 'arrow'
                    : 'sparkle'
              "
            />
            <span>{{ primaryLabel }}</span
            ><Icon
              v-if="state.phase === 'idle'"
              class="trailing-arrow"
              name="arrow"
            />
          </button>
          <div class="keyboard-hint">
            <kbd>Space</kbd><span>开始 / 停止</span><i></i><kbd>F</kbd
            ><span>全屏展示</span>
          </div>
        </div>
      </section>
    </main>

    <div v-else class="loading-view" role="status">
      <Icon name="sparkle" />
      <h1>{{ state.error ? "活动暂未就绪" : "正在为好运做准备" }}</h1>
      <p>{{ state.error || "正在加载 200 个幸运号码…" }}</p>
      <button v-if="state.error" class="primary-button" @click="initialize">
        重新加载
      </button>
    </div>

    <footer class="bottom-bar">
      <div class="footer-rule">
        <span class="status-dot"></span><span>号码范围 <b>001 — 200</b></span
        ><span class="footer-rule-extra">· 中奖不重复</span>
      </div>
      <div class="overall-progress">
        <span
          >已揭晓 <b>{{ String(state.records.length).padStart(2, "0") }}</b
          ><i> / 08</i></span
        >
        <div class="progress-track">
          <span
            :style="{ width: (state.records.length / 8) * 100 + '%' }"
          ></span>
        </div>
      </div>
      <div class="footer-actions">
        <button
          class="text-button footer-start-button"
          @click="footerAction"
          :disabled="!state.ready || state.phase === 'revealing' || resetting"
        >
          <Icon :name="state.phase === 'spinning' ? 'stop' : 'play'" />{{
            footerLabel
          }}
        </button>
        <button
          class="text-button reset-button"
          @click="openDialog('reset')"
          :disabled="busy || !state.records.length"
        >
          <Icon name="reset" />重置活动
        </button>
      </div>
    </footer>

    <TransitionGroup name="toast" tag="div" class="toasts" role="status"
      ><div
        class="toast-message"
        v-for="item in state.qipaoList"
        :key="item.id"
      >
        <Icon name="sparkle" />{{ item.text }}
      </div></TransitionGroup
    >

    <Teleport to="body">
      <Transition name="dialog">
        <div
          v-if="dialog"
          class="dialog-backdrop"
          @click.self="closeDialog"
          @keydown.esc.stop="closeDialog"
        >
          <section
            class="dialog-card"
            :class="{
              'reset-dialog': dialog === 'reset',
              'prizes-dialog': dialog === 'prizes' || dialog === 'prize-intro',
              'single-prize-dialog':
                (dialog === 'prizes' || dialog === 'prize-intro') &&
                previewPrize,
            }"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            ref="dialogEl"
            tabindex="-1"
            @keydown.tab="trapFocus"
          >
            <button
              class="dialog-close icon-button"
              @click="closeDialog"
              aria-label="关闭"
            >
              <Icon name="close" />
            </button>
            <template v-if="dialog === 'results'">
              <div class="eyebrow">THE LUCKY ONES</div>
              <h2 id="dialog-title">幸运，值得被记住。</h2>
              <p class="dialog-subtitle">
                已揭晓 {{ state.records.length }} 位幸运号码，共 8 个中奖名额。
              </p>
              <div class="results-list">
                <div
                  v-for="prize in state.prizes"
                  :key="prize.type"
                  class="result-row"
                >
                  <strong>{{ prize.text }}</strong>
                  <div class="result-numbers">
                    <span
                      v-for="record in recordsFor(prize.type)"
                      :key="record.id"
                      >{{ format(record.number) }}</span
                    ><span
                      v-for="i in remaining(prize)"
                      :key="'empty' + i"
                      class="empty-number"
                      >—</span
                    >
                  </div>
                  <small>{{ countFor(prize.type) }} / {{ prize.count }}</small>
                </div>
              </div>
              <div class="dialog-footer">
                <span><Icon name="shield" /> 已保存在当前浏览器</span>
                <div class="export-actions">
                  <button class="text-button" @click="exportBackup">
                    下载备份
                  </button>
                  <button
                    class="primary-button small"
                    :disabled="!state.records.length"
                    @click="exportResults"
                  >
                    <Icon name="download" />导出名单
                  </button>
                </div>
              </div>
            </template>
            <template
              v-else-if="dialog === 'prizes' || dialog === 'prize-intro'"
            >
              <div class="eyebrow">
                {{
                  dialog === "prize-intro"
                    ? "NEXT LUCKY MOMENT"
                    : "A LITTLE SURPRISE FOR YOU"
                }}
              </div>
              <h2 id="dialog-title">
                {{
                  dialog === "prize-intro"
                    ? "即将抽取 · " + previewPrize.text
                    : previewPrize
                      ? "本次奖品 · " + previewPrize.text
                      : "今晚的惊喜，都在这里。"
                }}
              </h2>
              <p class="dialog-subtitle">
                {{
                  previewPrize
                    ? previewPrize.name +
                      " · 共 " +
                      previewPrize.count +
                      " 个名额"
                    : "四档奖品，8 份幸运。一起期待惊喜揭晓。"
                }}
              </p>
              <div
                class="prize-gallery"
                :class="{ 'single-prize-gallery': previewPrize }"
              >
                <article
                  v-for="prize in previewPrizes"
                  :key="prize.type"
                  class="prize-showcase"
                >
                  <div class="prize-showcase-heading">
                    <strong>{{ prize.text }}</strong>
                    <span>{{ prize.count }} 个名额</span>
                  </div>
                  <div class="prize-photo">
                    <img :src="prize.image" :alt="prize.name" />
                  </div>
                  <h3>{{ prize.name }}</h3>
                  <div v-if="dialog !== 'prize-intro'" class="prize-recipients">
                    <span>中奖号码</span>
                    <div
                      v-if="recordsFor(prize.type).length"
                      class="prize-recipient-numbers"
                    >
                      <b
                        v-for="record in recordsFor(prize.type)"
                        :key="record.id"
                        >{{ format(record.number) }}</b
                      >
                    </div>
                    <span v-else class="prize-not-drawn">待开奖</span>
                  </div>
                </article>
              </div>
              <div class="prize-gallery-footer">
                <template v-if="dialog === 'prize-intro'">
                  <button class="secondary-button" @click="closeDialog">
                    暂不开始
                  </button>
                  <button class="primary-button" @click="confirmPrizeIntro">
                    <Icon name="play" />开始抽取{{ previewPrize.text }}
                  </button>
                </template>
                <template v-else>
                  <button
                    v-if="previewPrize"
                    class="text-button"
                    @click="openPrizePreview()"
                  >
                    查看全部奖品<Icon name="arrow" />
                  </button>
                  <span v-else>每个号码，仅中奖一次</span>
                  <button class="primary-button small" @click="closeDialog">
                    返回抽奖<Icon name="arrow" />
                  </button>
                </template>
              </div>
            </template>
            <template v-else>
              <span class="reset-symbol"><Icon name="reset" /></span>
              <div class="eyebrow">START A NEW MOMENT</div>
              <h2 id="dialog-title">
                {{
                  dialog === "restart"
                    ? "开始新一轮抽奖？"
                    : "开始一场新的幸运？"
                }}
              </h2>
              <p class="dialog-subtitle">
                当前 {{ state.records.length }} 条中奖记录将清空，所有 200
                个号码重新参与。旧记录会自动备份。
              </p>
              <div class="reset-actions">
                <button
                  class="secondary-button"
                  @click="closeDialog"
                  :disabled="resetting"
                >
                  保留当前活动</button
                ><button
                  class="primary-button small"
                  @click="resetActivity(dialog === 'restart')"
                  :disabled="resetting"
                >
                  {{
                    resetting
                      ? "正在准备…"
                      : dialog === "restart"
                        ? "确认开始"
                        : "确认重置"
                  }}
                </button>
              </div>
            </template>
          </section>
        </div>
      </Transition>
    </Teleport>
    <audio
      ref="audioEl"
      :src="baseUrl + 'data/music.mp3'"
      loop
      preload="none"
    ></audio>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import Icon from "./components/Icon.vue";
import { state, applySnapshot, nextPrize, pushQipao } from "./lottery/store.js";
import { engine } from "./lottery/engine.js";
import { api } from "./api/index.js";

const stageEl = ref(null);
const baseUrl = import.meta.env.BASE_URL;
const audioEl = ref(null);
const dialogEl = ref(null);
const dialog = ref("");
const previewPrizeType = ref(null);
const musicOn = ref(false);
const celebrating = ref(false);
const resetting = ref(false);
let returnFocus = null;
let pendingRequest = null;
const introducedPrizeTypes = new Set();
let celebrationTimer;
let alive = true;
let unsubscribe;
const format = (number) => String(number).padStart(3, "0");
const countFor = (type) =>
  state.records.filter((row) => row.type === type).length;
const recordsFor = (type) => state.records.filter((row) => row.type === type);
const remaining = (prize) =>
  Math.max(0, (prize?.count || 0) - countFor(prize?.type));
const currentPrize = computed(() =>
  state.prizes.find((prize) => prize.type === state.currentType),
);
const previewPrize = computed(() =>
  state.prizes.find((prize) => prize.type === previewPrizeType.value),
);
const previewPrizes = computed(() =>
  previewPrize.value ? [previewPrize.value] : state.prizes,
);
const allDone = computed(
  () =>
    state.prizes.length > 0 &&
    state.prizes.every((prize) => remaining(prize) === 0),
);
const busy = computed(() =>
  ["spinning", "revealing", "retry"].includes(state.phase),
);
const prizeName = (type) =>
  state.prizes.find((prize) => prize.type === type)?.text || "";
const primaryLabel = computed(() => {
  if (state.phase === "spinning") return "停止 · 揭晓幸运号码";
  if (state.phase === "revealing") return "正在揭晓…";
  if (state.phase === "retry") return "重试确认结果";
  if (allDone.value) return "查看全部中奖名单";
  if (state.phase === "result")
    return remaining(currentPrize.value)
      ? "继续抽取 · " + currentPrize.value.text
      : "下一奖项 · " + nextPrize()?.text;
  return "开始抽奖";
});
const footerLabel = computed(() => {
  if (state.phase === "spinning") return "停止抽奖";
  if (state.phase === "revealing") return "正在揭晓…";
  if (state.phase === "retry") return "重试确认";
  if (state.phase === "result" && !allDone.value) return "继续抽奖";
  return "开始抽奖";
});

function footerAction() {
  if (allDone.value) return openDialog("restart");
  return primaryAction();
}

async function initialize() {
  state.error = "";
  try {
    const snapshot = await api.getTempData();
    if (!alive) return;
    applySnapshot(snapshot);
    state.currentType = nextPrize()?.type || 1;
    state.phase = "idle";
    state.ready = true;
    await nextTick();
    const numbers = Array.from(
      { length: state.range.end - state.range.start + 1 },
      (_, i) => i + state.range.start,
    );
    engine.boot(stageEl.value, numbers);
    engine.markWinners(state.records.map((row) => row.number));
  } catch (error) {
    state.ready = false;
    state.error = error.message || "请检查浏览器是否允许保存网站数据";
  }
}

function selectPrize(prize) {
  if (busy.value || !remaining(prize)) return;
  state.currentType = prize.type;
  state.phase = "idle";
  state.winner = null;
  celebrating.value = false;
}

async function primaryAction() {
  if (!state.ready || dialog.value || state.phase === "revealing") return;
  if (state.phase === "retry" || state.phase === "spinning")
    return revealWinner();
  if (allDone.value) return openDialog("results");
  const prize = remaining(currentPrize.value)
    ? currentPrize.value
    : nextPrize();
  if (!introducedPrizeTypes.has(prize.type)) {
    previewPrizeType.value = prize.type;
    return openDialog("prize-intro");
  }
  state.currentType = prize.type;
  startSpin();
}

function confirmPrizeIntro() {
  if (dialog.value !== "prize-intro" || !previewPrize.value || busy.value)
    return;
  const prize = previewPrize.value;
  if (!remaining(prize)) return;
  introducedPrizeTypes.add(prize.type);
  state.currentType = prize.type;
  closeDialog();
  startSpin();
}

function startSpin() {
  state.winner = null;
  celebrating.value = false;
  pendingRequest = {
    type: state.currentType,
    id: crypto.randomUUID(),
    activityId: state.activityId,
  };
  state.phase = "spinning";
  engine.spin();
}

async function revealWinner() {
  if (!pendingRequest || state.phase === "revealing") return;
  const request = pendingRequest;
  state.phase = "revealing";
  engine.stop();
  try {
    const [data] = await Promise.all([
      api.draw(request.type, request.id, request.activityId),
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
    if (!alive || pendingRequest !== request) return;
    const latest = await api.getTempData();
    if (!alive || pendingRequest !== request) return;
    if (latest.activityId !== request.activityId) {
      await synchronize();
      return;
    }
    applySnapshot(latest);
    state.winner = data.winner;
    state.phase = "result";
    pendingRequest = null;
    engine.markWinners(state.records.map((row) => row.number));
    celebrating.value = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => {
      celebrating.value = false;
    }, 3600);
  } catch (error) {
    if (!alive || pendingRequest !== request) return;
    if (
      ["ACTIVITY_CHANGED", "PRIZE_FULL", "INVALID_REQUEST"].includes(error.code)
    ) {
      await synchronize(true);
      pushQipao(error.message);
      return;
    }
    state.phase = "retry";
    pushQipao(error.message + "，点击按钮重试确认");
  }
}

async function openPrizePreview(type = null) {
  if (busy.value) return;
  previewPrizeType.value = type;
  await openDialog("prizes");
}
async function openDialog(type) {
  if (busy.value) return;
  if (!dialog.value) returnFocus = document.activeElement;
  dialog.value = type;
  await nextTick();
  dialogEl.value?.focus();
}
function closeDialog() {
  if (resetting.value) return;
  dialog.value = "";
  returnFocus?.focus?.();
}
function trapFocus(event) {
  const elements = [
    ...dialogEl.value.querySelectorAll(
      'button:not(:disabled),a[href]:not(.disabled),[tabindex="0"]',
    ),
  ];
  const first = elements[0],
    last = elements[elements.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === dialogEl.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      document.activeElement === dialogEl.value)
  ) {
    event.preventDefault();
    first?.focus();
  }
}
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportResults() {
  try {
    const data = await api.getTempData();
    const rows = [["奖项", "奖品", "中奖号码", "开奖时间"]];
    for (const prize of data.cfgData.prizes) {
      for (const row of data.records.filter(
        (record) => record.type === prize.type,
      )) {
        rows.push([
          prize.text,
          prize.name,
          row.number,
          new Date(row.at).toLocaleString("zh-CN", { hour12: false }),
        ]);
      }
    }
    const csv = rows
      .map((row) =>
        row
          .map((cell) => '"' + String(cell).replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\r\n");
    download("\ufeff" + csv, "幸运盛典-中奖名单.csv", "text/csv;charset=utf-8");
  } catch (error) {
    pushQipao(error.message);
  }
}
async function exportBackup() {
  try {
    const data = await api.backup();
    download(
      JSON.stringify(data, null, 2),
      "幸运盛典-活动备份.json",
      "application/json",
    );
  } catch (error) {
    pushQipao(error.message);
  }
}

async function synchronize(forceIdle = false) {
  if (!state.ready) return;
  try {
    const data = await api.getTempData();
    if (!alive) return;
    const changed = data.activityId !== state.activityId;
    applySnapshot(data);
    engine.markWinners(state.records.map((row) => row.number));
    const filledWhileSpinning =
      state.phase === "spinning" && !remaining(currentPrize.value);
    if (changed || forceIdle || filledWhileSpinning) {
      engine.stop();
      pendingRequest = null;
      state.phase = "idle";
      state.winner = null;
      celebrating.value = false;
      state.currentType = nextPrize()?.type || 1;
      if (changed) introducedPrizeTypes.clear();
      dialog.value = "";
      if (changed) pushQipao("其他页面已开始新活动，当前页面已同步");
      else if (filledWhileSpinning)
        pushQipao("该奖项已在其他页面抽完，已切换下一奖项");
    }
  } catch (error) {
    pushQipao(error.message);
  }
}
async function resetActivity(startAfterReset = false) {
  resetting.value = true;
  try {
    const snapshot = await api.reset(state.activityId);
    applySnapshot(snapshot);
    state.phase = "idle";
    state.winner = null;
    state.currentType = nextPrize().type;
    pendingRequest = null;
    introducedPrizeTypes.clear();
    celebrating.value = false;
    engine.markWinners([]);
    resetting.value = false;
    closeDialog();
    if (startAfterReset) {
      await primaryAction();
    } else {
      pushQipao("活动已重置，200 个号码准备就绪");
    }
  } catch (error) {
    if (error.code === "ACTIVITY_CHANGED") await synchronize(true);
    pushQipao(error.message);
  } finally {
    resetting.value = false;
  }
}
async function toggleMusic() {
  try {
    if (musicOn.value) audioEl.value.pause();
    else await audioEl.value.play();
    musicOn.value = !musicOn.value;
  } catch {
    pushQipao("音乐播放失败，请重试");
  }
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    pushQipao("请使用浏览器全屏功能");
  }
}
function onKeydown(event) {
  if (event.code === "Escape" && dialog.value) {
    closeDialog();
    return;
  }
  if (
    event.repeat ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    dialog.value ||
    /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName)
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    primaryAction();
  }
  if (event.code === "KeyF") {
    event.preventDefault();
    toggleFullscreen();
  }
}
function confettiStyle(i) {
  return {
    "--x": ((i * 47) % 100) + "%",
    "--delay": ((i * 13) % 10) * 0.07 + "s",
    "--rotation": i * 31 + "deg",
    "--drift": ((i * 17) % 180) - 90 + "px",
  };
}
onMounted(() => {
  initialize();
  unsubscribe = api.subscribe(() => synchronize());
  window.addEventListener("focus", onFocus);
  window.addEventListener("keydown", onKeydown);
});
function onFocus() {
  synchronize();
}
onBeforeUnmount(() => {
  alive = false;
  engine.dispose();
  clearTimeout(celebrationTimer);
  unsubscribe?.();
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("keydown", onKeydown);
});
</script>
