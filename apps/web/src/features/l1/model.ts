/** Local interaction model only. Never authoritative for scoring or server progression. */
export type Subject =
  | "bridge"
  | "water"
  | "boat"
  | "ring"
  | "bush"
  | "rope"
  | "planks"
  | "woman"
  | "person"
  | "lamp"
  | "door";
export type Choice =
  | "take-rope"
  | "collect-wood"
  | "repair"
  | "cross-bridge"
  | "swim"
  | "use-ring"
  | "search"
  | "board"
  | "greet-woman"
  | "greet"
  | "take-lamp"
  | "light-lamp"
  | "enter";
export type Route = "bridge" | "swim" | "ring" | "boat";
export type Action =
  | { type: "choose"; choice: Choice; yes: boolean }
  | { type: "paddle" };
export type GameEvent = { id: string; at: string; action: Action };
export type L1State = {
  scene: "river" | "shore" | "complete";
  wood: boolean;
  repaired: boolean;
  ropeClicks: number;
  oar: boolean;
  bushClicks: number;
  rowing: boolean;
  strokes: number;
  route: Route | null;
  greeted: boolean;
  greetedWoman: boolean;
  lampTaken: boolean;
  lampLit: boolean;
  events: GameEvent[];
};
export const initialState = (): L1State => ({
  scene: "river",
  wood: false,
  repaired: false,
  ropeClicks: 0,
  oar: false,
  bushClicks: 0,
  rowing: false,
  strokes: 0,
  route: null,
  greeted: false,
  greetedWoman: false,
  lampTaken: false,
  lampLit: false,
  events: [],
});

export function canChoose(s: L1State, choice: Choice): boolean {
  if (s.scene === "complete") return false;
  if (s.scene === "shore") {
    return (
      choice === "enter" ||
      (choice === "greet" && !s.greeted) ||
      (choice === "greet-woman" && !s.greetedWoman) ||
      (choice === "take-lamp" && !s.lampTaken) ||
      (choice === "light-lamp" && !s.lampLit)
    );
  }
  switch (choice) {
    case "take-rope":
      return s.ropeClicks < 5 && !s.repaired;
    case "collect-wood":
      return s.ropeClicks === 5 && !s.wood && !s.repaired;
    case "repair":
      return s.ropeClicks === 5 && s.wood && !s.repaired;
    case "cross-bridge":
      return s.repaired;
    case "swim":
    case "use-ring":
      return true;
    case "search":
      return !s.oar;
    case "board":
      return s.oar && !s.rowing;
    default:
      return false;
  }
}

export function transition(s: L1State, event: GameEvent): L1State {
  if (s.events.some((e) => e.id === event.id) || s.scene === "complete")
    return s;
  const a = event.action;
  if (a.type === "paddle") {
    if (s.scene !== "river" || !s.rowing || !s.oar || s.strokes >= 5) return s;
    const strokes = s.strokes + 1;
    return {
      ...s,
      strokes,
      scene: strokes === 5 ? "shore" : "river",
      rowing: strokes < 5,
      route: strokes === 5 ? "boat" : null,
      events: [...s.events, event],
    };
  }
  if (!canChoose(s, a.choice)) return s;
  const next = { ...s, events: [...s.events, event] };
  // An explicit no is evidence; closing a prompt is not a refusal.
  if (!a.yes) return next;
  switch (a.choice) {
    case "take-rope":
      return { ...next, ropeClicks: s.ropeClicks + 1 };
    case "collect-wood":
      return { ...next, wood: true };
    case "repair":
      return { ...next, repaired: true, wood: false };
    case "search":
      return {
        ...next,
        bushClicks: s.bushClicks + 1,
        oar: s.bushClicks + 1 === 5,
      };
    case "board":
      return { ...next, rowing: true };
    case "cross-bridge":
      return { ...next, scene: "shore", rowing: false, route: "bridge" };
    case "swim":
      return { ...next, scene: "shore", rowing: false, route: "swim" };
    case "use-ring":
      return { ...next, scene: "shore", rowing: false, route: "ring" };
    case "greet-woman":
      return { ...next, greetedWoman: true };
    case "greet":
      return { ...next, greeted: true };
    case "take-lamp":
      return { ...next, lampTaken: true };
    case "light-lamp":
      return { ...next, lampLit: true };
    case "enter":
      return { ...next, scene: "complete" };
  }
}

export type Prompt = {
  title: string;
  body: string;
  choice?: Choice;
  yes?: string;
  action?: "paddle" | "search" | "take-rope";
  next?: Subject;
};
export function promptFor(s: L1State, subject: Subject): Prompt {
  if (s.rowing && subject === "boat")
    return {
      title: `划向对岸 · ${s.strokes} / 5`,
      body: "每按一次完成一次划桨。到岸前，也可以点击其他物品，换一种过河方式。",
      action: "paddle",
      yes: "划桨一次",
    };
  switch (subject) {
    case "bridge":
      return s.repaired
        ? {
            title: "从桥上走过去？",
            body: "木板已经铺好，通向对岸的路连起来了。",
            choice: "cross-bridge",
            yes: "是，走过木桥",
          }
        : s.wood
          ? {
              title: "把木板和绳子移到缺口",
              body: "将木板和绳子都放到发光的断桥缺口，才会修补。键盘也可用方向键移动。",
              next: "planks",
              yes: "查看木板",
            }
          : {
              title: "桥面缺了一段",
              body: "桥边有木板和绳子，把两样都搬到缺口就能修桥。也可以看看其他过河方式。",
              next: "planks",
              yes: "查看木板",
            };
    case "rope":
      if (s.ropeClicks < 5 && !s.repaired) return {
        title: "拿下绳子",
        body: `再点击${5 - s.ropeClicks}次就可以拿下来了。`,
        action: "take-rope",
        yes: "拿下绳子",
      };
      return {
        title: s.repaired ? "绳子已用于修桥" : "用绳子固定木板",
        body: "把绳子和木板都移到断桥缺口，才能修好木桥。可以先搬任意一件。",
      };
    case "planks":
      return {
        title: s.repaired ? "木板已经用来修桥" : "拾起绳子和木板修桥",
        body: s.repaired
          ? "木桥已连接两岸。"
          : "将木板和绳子都移到断桥缺口，才能修好木桥。可以先搬任意一件。",
      };
    case "water":
      return {
        title: "直接游泳过去？",
        body: "对岸就在前方。你也可以先探索岸边，寻找其他方式。",
        choice: "swim",
        yes: "是，游向对岸",
      };
    case "ring":
      return {
        title: "使用救生圈游过去？",
        body: "救生圈就在岸边，可以带着它渡河。",
        choice: "use-ring",
        yes: "是，使用救生圈",
      };
    case "bush":
      return s.oar
        ? {
            title: "草丛里找到了一支船桨",
            body: "船桨已安装在小船上，可以准备出发。",
            next: "boat",
            yes: "查看小船",
          }
        : {
            title: "草里好像有什么东西",
            body: `再点击草丛或这条提示 ${5 - s.bushClicks} 次，看看里面藏着什么。`,
            action: "search",
            yes: "拨开草丛",
          };
    case "boat":
      return s.oar
        ? {
            title: "要划船过去吗？",
            body: "你已找到船桨。上船后，完成五次划桨即可到达对岸。",
            choice: "board",
            yes: "是，上船",
          }
        : {
            title: "小船还缺一支船桨",
            body: "先看看附近的草丛，或选择另一种过河方式。",
            next: "bush",
            yes: "查看草丛",
          };
    case "woman":
      return s.greetedWoman
        ? {
            title: "你已经向她打过招呼",
            body: "你向她打了招呼。可以继续看看那盏灯，或走向门口。",
          }
        : {
            title: "要和她打招呼吗？",
            body: "她静静站在左侧草地上。你可以打个招呼，也可以继续探索。",
            choice: "greet-woman",
            yes: "是，打个招呼",
          };
    case "person":
      return s.greeted
        ? {
            title: "你已经向他打过招呼",
            body: "你向他打了招呼。你可以继续看看那盏灯，或走向门口。",
          }
        : {
            title: "要和他打招呼吗？",
            body: "他静静站在右侧岸边。你可以向他打招呼，也可以继续自己的探索。",
            choice: "greet",
            yes: "是，打个招呼",
          };
    case "lamp":
      return s.lampTaken
        ? s.lampLit
          ? { title: "灯已点亮", body: "这盏灯在你的物品栏里，发出柔和的光。" }
          : {
              title: "是否点亮手中的灯？",
              body: "你可以点亮它，也可以带着未点亮的灯继续走。",
              choice: "light-lamp",
              yes: "是，点亮灯",
            }
        : {
            title: "要拿起灯吗？",
            body: s.lampLit
              ? "灯已经亮着。你可以把它带在身边。"
              : "一盏未点亮的灯放在路边。你可以拿起它，也可以留在原处。",
            choice: "take-lamp",
            yes: "是，拿起灯",
          };
    case "door":
      return {
        title: "进入房间？",
        body: "确认后将结束第一幕。你也可以留在这里，继续看看人物和灯。",
        choice: "enter",
        yes: "是，进入房间",
      };
  }
}

export const labels: Record<Subject, string> = {
  bridge: "木桥",
  water: "河面",
  boat: "小船",
  ring: "救生圈",
  bush: "草丛",
  planks: "木板",
  rope: "绳子",
  person: "右侧岸边的男子",
  woman: "左侧草地的女子",
  lamp: "灯",
  door: "房门",
};
export const choiceLabels: Record<Choice, string> = {
  "take-rope": "拿下绳子",
  "collect-wood": "拾起木板",
  repair: "拾起绳子和木板修桥",
  "cross-bridge": "从桥过河",
  swim: "直接游泳",
  "use-ring": "使用救生圈",
  search: "拨开草丛",
  board: "上船",
  greet: "和他打招呼",
  "greet-woman": "和她打招呼",
  "take-lamp": "拿起灯",
  "light-lamp": "点亮灯",
  enter: "进入房间",
};
