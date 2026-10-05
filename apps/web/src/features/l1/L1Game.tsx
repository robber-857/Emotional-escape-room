"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {LevelHeading} from "../shared/LevelHeading";
import { woodAtGap, ropeAtGap, repairMaterialsReady } from "./geometry";
import { Sprite } from "./Sprite";
import { Scene, asset, assetNames } from "./Scene";
import {
  initialState,
  promptFor,
  choiceLabels,
  type Action,
  type L1State,
  type Subject,
} from "./model";
import { type Positions } from "./save";
import { SESSION_KEY, PENDING_KEY, readSession, readPending, readDraft, createSession, resumeSession, prepare, submit, getReceipts, RejectedAction, type Session, type Receipt } from "./api";

export function L1Game() {
  const sessionRef = useRef<Session | null>(null);
  const requestLock = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [syncError, setSyncError] = useState("");
  const [effect, setEffect] = useState<"oar" | "repair" | "rope" | null>(null);
  useEffect(() => {
    if (!effect) return;
    const timer = setTimeout(() => setEffect(null), 1200);
    return () => clearTimeout(timer);
  }, [effect]);
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const [positions, setPositions] = useState<Positions>({});
  const positionsRef = useRef<Positions>({});
  const [selected, setSelected] = useState<Subject | null>(null);
  const [started, setStarted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState("连接服务器后开始保存进度");
  const [message, setMessage] = useState(
    "河水静静流淌。先看看岸边，寻找过河的方式。",
  );
  const [modal, setModal] = useState<"help" | "restart" | "trace" | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [motion, setMotion] = useState(true);
  const [strokeBusy, setStrokeBusy] = useState(false);
  const strokeLock = useRef(false);
  const strokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const rotationDialog = useRef<HTMLDialogElement>(null);
  const promptHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      const saved = readSession();
      if (saved) { sessionRef.current = saved; setHasSave(true); }
      setPendingSync(!!readPending());
    } catch { setSyncError("浏览器存储无法读取，请检查站点存储权限。"); }
    const changed = (e: StorageEvent) => {
      if (e.key === SESSION_KEY || e.key === PENDING_KEY) setExternalChange(true);
    };
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("storage", changed);
      if (strokeTimer.current) clearTimeout(strokeTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAssetError(false);
    setLoaded(false);
    Promise.all(
      assetNames.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = asset(name);
          }),
      ),
    )
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch(() => {
        if (active) setAssetError(true);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    const query = window.matchMedia(
      "(pointer: coarse) and (orientation: portrait) and (max-width: 900px)",
    );
    const update = () => setPortrait(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (portrait) rotationDialog.current?.showModal();
    else rotationDialog.current?.close();
  }, [portrait]);
  useEffect(() => {
    if (modal === "trace" && sessionRef.current) {
      let active = true;
      getReceipts(sessionRef.current).then((rows) => { if (active) setReceipts(rows); }).catch(() => { if (active) setSyncError("无法刷新服务器记录，请重试同步"); });
      return () => { active = false; };
    }
  }, [modal]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (selected) promptHeading.current?.focus({ preventScroll: true });
  }, [selected, state.scene]);

  function save(_next: L1State, nextPositions: Positions) {
    // Cosmetic draft only: server state is never restored from this storage.
    try {
      if (sessionRef.current) localStorage.setItem(`emotional:l1:draft:${sessionRef.current.id}`, JSON.stringify(nextPositions));
      setSaveStatus("关卡进度已由服务器保存；道具摆放保存在本机");
    } catch { setSaveStatus("道具摆放未能保存，关卡进度仍在服务器"); }
  }
  function applySession(session: Session) {
    sessionRef.current = session;
    stateRef.current = session.state;
    setState(session.state);
    setHasSave(true);
    setSaveStatus(`服务器已保存 · 版本 ${session.version}`);
  }
  async function continueGame() {
    if (requestLock.current || externalChange) return;
    requestLock.current = true; setSyncing(true); setSyncError("");
    try {
      let session = sessionRef.current;
      if (!session) throw new Error("当前浏览器没有服务器会话");
      session = await resumeSession(session);
      applySession(session);
      const draft = readDraft(session);
      positionsRef.current = draft; setPositions(draft);
      const pending = readPending();
      if (pending) {
        const result = await submit(session, pending);
        session = result.session; applySession(session);
        positionsRef.current = session.positions; setPositions(session.positions);
      }
      setPendingSync(false);
      setReceipts(await getReceipts(session));
      setSelected(null); setStarted(true); setMessage("已从服务器恢复进度，可以继续探索。");
    } catch (error) {
      if (error instanceof RejectedAction) {
        applySession(error.session); setSelected(null); setReceipts((r) => [...r, error.receipt]);
        setPendingSync(false); setStarted(true);
      }
      setSyncError(error instanceof Error ? error.message : "连接失败，请重试");
    } finally { requestLock.current = false; setSyncing(false); }
  }
  async function act(action: Action) {
    if (
      requestLock.current || pendingSync ||
      !started ||
      !loaded ||
      portrait ||
      modal ||
      externalChange ||
      strokeLock.current ||
      effect
    )
      return;
    if (stateRef.current.events.length >= 1000) {
      setMessage("本次探索记录已满，请从菜单重新开始。");
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    requestLock.current = true; setSyncing(true); setSyncError("");
    const before = stateRef.current;
    let next: L1State;
    try {
      const pending = prepare(session, action, positionsRef.current);
      setPendingSync(true);
      const result = await submit(session, pending);
      setReceipts((r) => [...r, result.receipt]);
      applySession(result.session); next = result.session.state;
      setPendingSync(false);
    } catch (error) {
      if (error instanceof RejectedAction) {
        applySession(error.session);
        positionsRef.current = error.session.positions; setPositions(error.session.positions);
        setReceipts((r) => [...r, error.receipt]); setPendingSync(false);
      }
      setSyncError(error instanceof Error ? error.message : "连接失败，请重试同步");
      return;
    } finally { requestLock.current = false; setSyncing(false); }
    if (!before.oar && next.oar) setEffect("oar");
    if (!before.repaired && next.repaired) setEffect("repair");
    if (before.ropeClicks < 5 && next.ropeClicks === 5) setEffect("rope");
    if (action.type === "paddle") {
      strokeLock.current = true;
      setStrokeBusy(true);
      strokeTimer.current = setTimeout(() => {
        strokeLock.current = false;
        setStrokeBusy(false);
      }, 450);
      setMessage(
        next.scene === "shore"
          ? "五次划桨后，你抵达了对岸。"
          : `船向前移动了一段。已完成 ${next.strokes} 次划桨。`,
      );
    } else if (!action.yes) {
      setMessage("你选择了暂不这样做。可以继续探索，之后也能重新选择。");
      setSelected(null);
    } else {
      setMessage(
        `${choiceLabels[action.choice]}${action.choice === "enter" ? "，第一幕体验已结束。" : "。"}`,
      );
      if (action.choice === "search") setSelected(next.oar ? "boat" : "bush");
      else if (action.choice === "take-rope") {
        setSelected("rope");
        setMessage(next.ropeClicks === 5 ? "绳子掉到了岸边，现在可以拖动它修桥。" : `再点击${5 - next.ropeClicks}次就可以拿下来了。`);
      }
      else if (action.choice === "repair") setSelected("bridge");
      else if (action.choice === "greet") setSelected("person");
      else if (action.choice === "greet-woman") setSelected("woman");
      else if (action.choice === "light-lamp") setSelected("lamp");
      else if (
        action.choice !== "collect-wood" &&
        action.choice !== "take-lamp" &&
        action.choice !== "board"
      )
        setSelected(null);
    }
    if (before.scene !== next.scene) setSelected(null);
  }
  async function move(next: Positions) {
    if (
      requestLock.current || pendingSync || effect ||
      !started ||
      !loaded ||
      portrait ||
      modal ||
      externalChange ||
      state.scene === "complete"
    )
      return;
    positionsRef.current = next;
    setPositions(next);
    save(stateRef.current, next);
    if (
      repairMaterialsReady(next) &&
      stateRef.current.ropeClicks === 5 &&
      !stateRef.current.repaired &&
      stateRef.current.scene === "river"
    ) {
      if (!stateRef.current.wood)
        await act({ type: "choose", choice: "collect-wood", yes: true });
      if (stateRef.current.wood) await act({ type: "choose", choice: "repair", yes: true });
    }
  }
  function resetPositions() {
    if (externalChange) return;
    positionsRef.current = {};
    setPositions({});
    save(stateRef.current, {});
    setModal(null);
  }
  async function fresh() {
    if (externalChange || requestLock.current || pendingSync) return;
    requestLock.current = true; setSyncing(true); setSyncError("");
    let session: Session;
    try { session = await createSession(); }
    catch (error) { setSyncError(error instanceof Error ? error.message : "无法创建服务器会话"); return; }
    finally { requestLock.current = false; setSyncing(false); }
    applySession(session); setReceipts([]);
    if (strokeTimer.current) clearTimeout(strokeTimer.current);
    strokeLock.current = false;
    setStrokeBusy(false);
    const next = initialState();
    stateRef.current = next;
    positionsRef.current = {};
    setState(next);
    setPositions({});
    setSelected(null);
    setModal(null);
    setExternalChange(false);
    setStarted(true);
    setMessage("河水静静流淌。先看看岸边，寻找过河的方式。");
    save(next, {});
  }
  const restartFromExit = useRef(false);
  useEffect(() => {
    if (!loaded || restartFromExit.current || new URLSearchParams(window.location.search).get("restart") !== "1") return;
    restartFromExit.current = true;
    window.history.replaceState(null, "", "/");
    void fresh();
  }, [loaded, fresh]);
  const blocked =
    syncing || pendingSync || strokeBusy ||
    !started ||
    !loaded ||
    portrait ||
    !!modal ||
    externalChange ||
    state.scene === "complete" ||
    !!effect;
  const prompt = selected ? promptFor(state, selected) : null;
  if (
    prompt &&
    !state.repaired &&
    selected &&
    !(selected === "rope" && state.ropeClicks < 5) &&
    ["bridge", "planks", "rope"].includes(selected)
  ) {
    const woodReady = positions.planks && woodAtGap(positions.planks);
    const ropeReady = positions.rope && ropeAtGap(positions.rope);
    if (woodReady && !ropeReady)
      prompt.body = "木板已放到缺口，还需要把绳子移过来固定。";
    else if (ropeReady && !woodReady)
      prompt.body = "绳子已放到缺口，还需要把木板移过来。";
  }
  function select(subject: Subject) {
    if (blocked) return;
    setSelected(subject);
    if (subject === "bush" && !state.oar)
      act({ type: "choose", choice: "search", yes: true });
    if (subject === "rope" && state.ropeClicks < 5)
      act({ type: "choose", choice: "take-rope", yes: true });
  }
  const anchor: Record<Subject, [number, number]> = {
    bridge: [33, 65],
    water: [51, 64],
    boat: [71 - state.strokes * 2, 57 - state.strokes * 1.4],
    ring: [82, 65],
    bush: [88, 53],
    planks: [83, 81],
    rope: state.ropeClicks < 5 ? [83.4, 51.6] : [71.5, 83],
    person: [62.6, 60.5],
    woman: [15.8, 58],
    lamp: state.lampTaken ? [91, 81] : [13, 83],
    door: [43, 49],
  };
  const activeSubject = selected;
  const baseAnchor = anchor[activeSubject || "bridge"];
  const delta = activeSubject && !(activeSubject === "rope" && state.ropeClicks < 5) ? positions[activeSubject] : undefined;
  const bubbleX = Math.max(
    20,
    Math.min(80, baseAnchor[0] + (delta?.x || 0) * 100),
  );
  const bubbleY = Math.max(
    38,
    Math.min(83, baseAnchor[1] + (delta?.y || 0) * 100),
  );

  return (
    <main className={`game ${!motion ? "still" : ""}`}>
      <section className="stageWrap" aria-label="第一幕游戏舞台">
        <Scene
          state={state}
          selected={selected}
          positions={positions}
          onSelect={select}
          onMove={move}
          effect={effect}
          disabled={blocked}
        />
        <LevelHeading className="sceneHeading" ready={started&&loaded&&!portrait}>
          <h1>分离之河</h1>
        </LevelHeading>
        {!started && (
          <div className="welcome">
            <div>
              <span className="eyebrow">一段关于选择的旅程</span>
              <h2>光在河的另一边</h2>
              <p>
                不必急着抵达。看看周围，
                <br />
                找到你想走的那条路。
              </p>
              {loaded ? (
                <div className="welcomeActions">
                  <button
                    className="primary gameYes"
                    disabled={syncing || externalChange}
                    onClick={() => hasSave ? continueGame() : fresh()}
                  >
                    {hasSave ? "继续上次旅程" : "开始探索"}{" "}
                    <span aria-hidden="true">→</span>
                  </button>
                  {hasSave && (
                    <button
                      className="quiet"
                      onClick={() => setModal("restart")}
                    >
                      重新开始
                    </button>
                  )}
                </div>
              ) : assetError ? (
                <>
                  <p role="alert">场景素材加载失败，请检查网络后重试。</p>
                  <button onClick={() => setLoadAttempt((n) => n + 1)}>
                    重新加载
                  </button>
                </>
              ) : (
                <p role="status">正在准备河岸与道具…</p>
              )}
              <small>第一幕 · 服务器校验与保存</small>
            </div>
          </div>
        )}
        {started && !loaded && (
          <div className="welcome">
            <div role="alert">
              <h2>正在准备场景</h2>
              <p>{assetError ? "场景素材加载失败，请重试。" : "加载中…"}</p>
              {assetError && (
                <button onClick={() => setLoadAttempt((n) => n + 1)}>
                  重新加载
                </button>
              )}
            </div>
          </div>
        )}
        {started && state.scene === "complete" && (
          <div className="welcome completion">
            <div>
              <span className="eyebrow">第一幕 · 已走过</span>
              <h2>你来到了门前</h2>
              <p>这段河岸上的选择，已经留在旅程里。</p>
              <dl>
                <div>
                  <dt>过河方式</dt>
                  <dd>
                    {
                      {
                        bridge: "修桥步行",
                        swim: "直接游泳",
                        ring: "使用救生圈",
                        boat: "划船",
                      }[state.route!]
                    }
                  </dd>
                </div>
                <div>
                  <dt>随身物品</dt>
                  <dd>
                    {state.lampTaken
                      ? state.lampLit
                        ? "亮着的灯"
                        : "未点亮的灯"
                      : "没有带灯"}
                  </dd>
                </div>
              </dl>
              <p className="nextNotice">第二幕可继续探索桌边、座位和钥匙。</p>
              <Link className="primary l2Entry" href="/l2">进入第二幕</Link>
              <button className="primary gameYes" onClick={() => setModal("restart")}>
                再探索一次
              </button>
              <button className="quiet" onClick={() => setModal("trace")}>
                查看本次选择
              </button>
            </div>
          </div>
        )}
        {started && prompt && (
          <div
            className="sceneBubble"
            style={{ left: `${bubbleX}%`, top: `${bubbleY}%` }}
            inert={blocked}
          >
            <div className="prompt" data-game-prompt aria-live="polite">
              {prompt ? (
                <>
                  <div className="promptTitle">
                    <h2 ref={promptHeading} tabIndex={-1}>
                      {prompt.title}
                    </h2>
                    <button
                      className="closePrompt"
                      aria-label="关闭提示，继续探索"
                      onClick={() => setSelected(null)}
                    >
                      ×
                    </button>
                  </div>
                  {prompt.body && <p>{prompt.body}</p>}
                  <div className="decisions">
                    {prompt.choice && (
                      <>
                        <button
                          onClick={() =>
                            act({
                              type: "choose",
                              choice: prompt.choice!,
                              yes: false,
                            })
                          }
                        >
                          否
                        </button>
                        <button
                          className="primary gameYes"
                          onClick={() =>
                            act({
                              type: "choose",
                              choice: prompt.choice!,
                              yes: true,
                            })
                          }
                        >
                          是
                        </button>
                      </>
                    )}
                    {prompt.action === "search" && (
                      <button
                        className="primary gameYes"
                        onClick={() =>
                          act({ type: "choose", choice: "search", yes: true })
                        }
                      >
                        拨开草丛 · {state.bushClicks} / 5
                      </button>
                    )}
                    {prompt.action === "take-rope" && (
                      <button className="primary gameYes" onClick={() => act({ type: "choose", choice: "take-rope", yes: true })}>
                        拿下绳子 · {state.ropeClicks} / 5
                      </button>
                    )}
                    {prompt.action === "paddle" && (
                      <button
                        className="primary gameYes"
                        disabled={strokeBusy}
                        onClick={() => act({ type: "paddle" })}
                      >
                        {strokeBusy ? "正在划桨…" : "划桨一次"}{" "}
                        <span>{state.strokes} / 5</span>
                      </button>
                    )}
                    {prompt.next && (
                      <button
                        className="primary gameYes"
                        onClick={() => setSelected(prompt.next!)}
                      >
                        {prompt.yes}
                      </button>
                    )}
                    {selected === "lamp" &&
                      !state.lampTaken &&
                      !state.lampLit && (
                        <section
                          className="lampLightChoice"
                          aria-label="是否点亮灯"
                        >
                          <h3>要点亮灯吗？</h3>
                          <div className="decisions">
                            <button
                              onClick={() =>
                                act({
                                  type: "choose",
                                  choice: "light-lamp",
                                  yes: false,
                                })
                              }
                            >
                              否
                            </button>
                            <button
                              className="primary gameYes"
                              onClick={() =>
                                act({
                                  type: "choose",
                                  choice: "light-lamp",
                                  yes: true,
                                })
                              }
                            >
                              是
                            </button>
                          </div>
                        </section>
                      )}
                  </div>
                </>
              ) : (
                <>
                  <span className="eyebrow">沿着自己的节奏</span>
                  <h2>
                    {state.scene === "river"
                      ? "你想怎样到达对岸？"
                      : "岸边，有人和一盏灯"}
                  </h2>
                  <p>{message}</p>
                </>
              )}
            </div>
          </div>
        )}
        {started && !prompt && (
          <p className="sceneStatus" role="status">
            {effect === "repair"
              ? "木板正在铺合，缺口渐渐连起来…"
              : effect === "oar"
                ? "船桨从草丛中跃出，落在了小船上。"
                : message}
          </p>
        )}
        {started && state.scene === "shore" && (
          <aside className="shoreInventory" aria-label="物品栏">
            <span>物品</span>
            {state.lampTaken ? (
              <button
                aria-label={
                  state.lampLit ? "物品栏：亮着的灯" : "物品栏：未点亮的灯"
                }
                onClick={() => setSelected("lamp")}
                disabled={blocked}
              >
                <svg viewBox="327 1307 114 184" aria-hidden="true">
                  <Sprite id={state.lampLit ? "lamp-on" : "lamp-off"} />
                </svg>
              </button>
            ) : (
              <div className="emptySlot" aria-label="物品栏为空" />
            )}
          </aside>
        )}
      </section>
      <button
        className="gameMenu"
        onClick={() => setModal("help")}
        aria-label="打开游戏菜单"
      >
        ☰
      </button>
      {(syncing || syncError || pendingSync) && (
        <section className="syncStatus" role="status">
          <p>{syncing ? "正在等待服务器校验…" : syncError || "有尚未确认的事件"}</p>
          {!syncing && <button onClick={continueGame} disabled={externalChange || syncing}>重试同步 / 载入服务器进度</button>}
        </section>
      )}
      {externalChange && (
        <section className="conflict" role="alert">
          <p>另一标签页更新了这段旅程。为避免覆盖进度，请重新载入。</p>
          <button onClick={() => location.reload()}>载入最新进度</button>
        </section>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <button
          className="dialogClose"
          onClick={() => setModal(null)}
          aria-label="关闭"
        >
          ×
        </button>
        {modal === "help" && (
          <>
            <span className="eyebrow">慢慢探索，无需赶路</span>
            <h2>操作说明</h2>
            <p>
              点击场景中的物件，在物件上方选择“是”或“否”。关闭提示不会替你作出选择。
            </p>
            <p>
              绳子挂在救生圈后方的木桩上，点击绳子或“拿下绳子”共五次后，会掉到岸边原位置。拿下后可拖动绳子；木板和救生圈也可以拖动，键盘聚焦后可用方向键移动。木板和绳子的中心都落到发光的断桥缺口内才会修桥；落在其他位置会保留摆放。修好桥后仍需确认才过河。
            </p>
            <p>
              点击草丛或拨草提示共五次，船桨会跳出并安装到小船。确认上船后，按五次“划桨一次”抵达对岸。人物、拿灯、点灯和进门分别决定；可以带未点亮的灯离开。
            </p>
            <div className="decisions">
              <button onClick={() => setMotion((v) => !v)}>
                {motion ? "减少场景动效" : "开启场景动效"}
              </button>
              <button
                disabled={!started || externalChange || syncing || pendingSync}
                onClick={resetPositions}
              >
                恢复道具位置
              </button>
              <button
                disabled={externalChange || syncing || pendingSync}
                onClick={() => setModal("restart")}
              >
                重新开始旅程
              </button>
            </div>
            <p role="status">{saveStatus}</p>
            <div className="decisions">
              <button
                disabled={!started || externalChange || syncing || pendingSync}
                onClick={() => {
                  save(stateRef.current, positionsRef.current);
                  setStarted(false);
                  setModal(null);
                }}
              >
                保存并返回
              </button>
              <button onClick={() => setModal("trace")}>开发预览记录</button>
            </div>
            <small>
              关卡进度以服务器回执为准；尚不计算正式人格分数。
            </small>
          </>
        )}
        {modal === "restart" && (
          <>
            <h2>重新开始第一幕？</h2>
            <p>将创建新的服务器会话，旧会话记录保留。</p>
            <div className="decisions">
              <button onClick={() => setModal(null)}>保留当前旅程</button>
              <button className="primary gameYes" disabled={syncing || pendingSync} onClick={fresh}>
                确认重新开始
              </button>
            </div>
          </>
        )}
        {modal === "trace" && (
          <>
            <span className="eyebrow">REVIEW · 服务器校验记录</span>
            <h2>这次旅程的选择</h2>
            <p>
              每条记录包含服务器校验结果；只有接受的动作才推进关卡。尚不计算正式分数。
              会话：{sessionRef.current?.id} · 规则：{sessionRef.current?.rules_version}
            </p>
            <ol className="trace">
              {receipts.map((e, i) => (
                <li key={`${e.action_id}-${i}`}>
                  <span>{e.action.type === "paddle" ? "划桨一次" : choiceLabels[e.action.choice]}{e.action.type === "choose" ? (e.action.yes ? " · 是" : " · 否") : ""}<br /><small>{e.action_id}</small></span>
                  <b>{e.accepted ? "服务器已接受" : "服务器已拒绝"} · v{e.version}<br />{e.code}{e.duplicate ? " · 重试去重" : ""}</b>
                </li>
              ))}
            </ol>
            {!receipts.length && <p>还没有执行任何选择。</p>}
          </>
        )}
      </dialog>
      <dialog
        className="rotation"
        ref={rotationDialog}
        onCancel={(e) => e.preventDefault()}
      >
        <span aria-hidden="true">↻</span>
        <h2>换一个方向，继续旅程</h2>
        <p>为了保证用户体验请翻转手机为横屏</p>
      </dialog>
    </main>
  );
}
