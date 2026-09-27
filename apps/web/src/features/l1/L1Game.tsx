"use client";

import { useEffect, useRef, useState } from "react";
import { woodAtGap, ropeAtGap, repairMaterialsReady } from "./geometry";
import { Sprite } from "./Sprite";
import { Scene, asset, assetNames } from "./Scene";
import {
  initialState,
  transition,
  promptFor,
  choiceLabels,
  type Action,
  type L1State,
  type Subject,
} from "./model";
import { SAVE_KEY, restore, type Positions, type SavedGame } from "./save";

export function L1Game() {
  const [effect, setEffect] = useState<"oar" | "repair" | null>(null);
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
  const [saveStatus, setSaveStatus] = useState("进度仅保存在此浏览器");
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
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = restore(raw);
        stateRef.current = saved.state;
        positionsRef.current = saved.positions;
        setState(saved.state);
        setPositions(saved.positions);
        setHasSave(true);
      }
    } catch {
      setSaveStatus("本机存档无法读取。开始新旅程会重新建立存档。");
    }
    const changed = (e: StorageEvent) => {
      if (e.key === SAVE_KEY) setExternalChange(true);
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
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (selected) promptHeading.current?.focus({ preventScroll: true });
  }, [selected, state.scene]);

  function save(next: L1State, nextPositions: Positions) {
    try {
      const data: SavedGame = {
        version: 2,
        events: next.events,
        positions: nextPositions,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      setSaveStatus("已保存到此浏览器");
      setHasSave(true);
    } catch {
      setSaveStatus("保存失败：请允许浏览器存储。关闭页面可能丢失本次进度。");
    }
  }
  function act(action: Action) {
    if (
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
    const next = transition(stateRef.current, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action,
    });
    if (next === stateRef.current) return;
    const before = stateRef.current;
    stateRef.current = next;
    setState(next);
    save(next, positionsRef.current);
    if (!before.oar && next.oar) setEffect("oar");
    if (!before.repaired && next.repaired) setEffect("repair");
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
  function move(next: Positions) {
    if (
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
      !stateRef.current.repaired &&
      stateRef.current.scene === "river" &&
      !stateRef.current.rowing
    ) {
      if (!stateRef.current.wood)
        act({ type: "choose", choice: "collect-wood", yes: true });
      act({ type: "choose", choice: "repair", yes: true });
    }
  }
  function resetPositions() {
    if (externalChange) return;
    positionsRef.current = {};
    setPositions({});
    save(stateRef.current, {});
    setModal(null);
  }
  function fresh() {
    if (externalChange) return;
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
  const blocked =
    !started ||
    !loaded ||
    portrait ||
    !!modal ||
    externalChange ||
    state.scene === "complete" ||
    !!effect;
  const prompt = state.rowing
    ? promptFor(state, "boat")
    : selected
      ? promptFor(state, selected)
      : null;
  if (
    prompt &&
    !state.repaired &&
    !state.rowing &&
    selected &&
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
    if (blocked || (state.rowing && subject !== "boat")) return;
    setSelected(subject);
    if (subject === "bush" && !state.oar)
      act({ type: "choose", choice: "search", yes: true });
  }
  const anchor: Record<Subject, [number, number]> = {
    bridge: [33, 65],
    water: [51, 64],
    boat: [71 - state.strokes * 2, 57 - state.strokes * 1.4],
    ring: [82, 65],
    bush: [88, 53],
    planks: [83, 81],
    rope: [71.5, 83],
    person: [33.3, 56],
    woman: [26.8, 57],
    lamp: state.lampTaken ? [91, 81] : [13, 83],
    door: [43, 49],
  };
  const activeSubject = state.rowing ? "boat" : selected;
  const baseAnchor = anchor[activeSubject || "bridge"];
  const delta = activeSubject && positions[activeSubject];
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
        <div className="sceneHeading">
          <h1>分离之河</h1>
        </div>
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
                    className="primary"
                    onClick={() =>
                      hasSave
                        ? (setStarted(true),
                          setMessage("已恢复本机进度，可以继续探索。"))
                        : fresh()
                    }
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
              <small>第一幕交互预览 · 进度保存在此浏览器</small>
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
              <p className="nextNotice">本次预览到此结束，第二幕尚未开放。</p>
              <button className="primary" onClick={() => setModal("restart")}>
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
            <div className="prompt" aria-live="polite">
              {prompt ? (
                <>
                  <div className="promptTitle">
                    <h2 ref={promptHeading} tabIndex={-1}>
                      {prompt.title}
                    </h2>
                    {!state.rowing && (
                      <button
                        className="closePrompt"
                        aria-label="关闭提示，继续探索"
                        onClick={() => setSelected(null)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <p>{prompt.body}</p>
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
                          className="primary"
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
                        className="primary"
                        onClick={() =>
                          act({ type: "choose", choice: "search", yes: true })
                        }
                      >
                        拨开草丛 · {state.bushClicks} / 5
                      </button>
                    )}
                    {prompt.action === "paddle" && (
                      <button
                        className="primary"
                        disabled={strokeBusy}
                        onClick={() => act({ type: "paddle" })}
                      >
                        {strokeBusy ? "正在划桨…" : "划桨一次"}{" "}
                        <span>{state.strokes} / 5</span>
                      </button>
                    )}
                    {prompt.next && (
                      <button
                        className="primary"
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
                          <h3>是否点亮？</h3>
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
                              className="primary"
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
                      : "门边，有人和一盏灯"}
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
              木板、绳子与救生圈可以拖动，键盘聚焦后可用方向键移动。木板和绳子的中心都落到发光的断桥缺口内才会修桥；落在其他位置会保留摆放。修好桥后仍需确认才过河。
            </p>
            <p>
              点击草丛或拨草提示共五次，船桨会跳出并安装到小船。确认上船后，按五次“划桨一次”抵达对岸。人物、拿灯、点灯和进门分别决定；可以带未点亮的灯离开。
            </p>
            <div className="decisions">
              <button onClick={() => setMotion((v) => !v)}>
                {motion ? "减少场景动效" : "开启场景动效"}
              </button>
              <button
                disabled={!started || externalChange}
                onClick={resetPositions}
              >
                恢复道具位置
              </button>
              <button
                disabled={externalChange}
                onClick={() => setModal("restart")}
              >
                重新开始旅程
              </button>
            </div>
            <p role="status">{saveStatus}</p>
            <div className="decisions">
              <button
                disabled={!started || externalChange}
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
              本次为前端预览：本机存档不代表服务端保存，尚不计算人格分数。
            </small>
          </>
        )}
        {modal === "restart" && (
          <>
            <h2>重新开始第一幕？</h2>
            <p>将替换此浏览器中的当前预览进度。</p>
            <div className="decisions">
              <button onClick={() => setModal(null)}>保留当前旅程</button>
              <button className="primary" onClick={fresh}>
                确认重新开始
              </button>
            </div>
          </>
        )}
        {modal === "trace" && (
          <>
            <span className="eyebrow">REVIEW · 本机交互记录</span>
            <h2>这次旅程的选择</h2>
            <p>
              这里只记录前端动作顺序。无服务端入账、无正式分数，也不代表 UAT
              已通过。
            </p>
            <ol className="trace">
              {state.events.map((e) => (
                <li key={e.id}>
                  <span>
                    {e.action.type === "paddle"
                      ? "划桨一次"
                      : choiceLabels[e.action.choice]}
                  </span>
                  <b>
                    {e.action.type === "paddle"
                      ? "完成"
                      : e.action.yes
                        ? "是"
                        : "否"}
                  </b>
                </li>
              ))}
            </ol>
            {!state.events.length && <p>还没有执行任何选择。</p>}
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
