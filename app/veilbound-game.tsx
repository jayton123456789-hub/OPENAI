"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  chooseAIInquiry,
  createGame,
  Difficulty,
  GameState,
  getIdentity,
  IDENTITIES,
  IdentityId,
  resolveInquiry,
  sortHand,
  validInquiryIdentities,
  VeilCard,
} from "@/lib/veilbound";
import type {
  OnlineAction,
  OnlineCredentials,
  OnlineGameView,
  OnlineRoomView,
} from "@/lib/online-room";

type Screen =
  | "title"
  | "modes"
  | "solo-setup"
  | "local-setup"
  | "online-setup"
  | "tutorial"
  | "chronicle"
  | "settings"
  | "game";

interface UserSettings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  largeCards: boolean;
}

interface Chronicle {
  games: number;
  wins: number;
  identitiesBound: number;
  bestScore: number;
  lastGameId?: string;
}

const SAVE_KEY = "veilbound-save-v1";
const SETTINGS_KEY = "veilbound-settings-v1";
const STATS_KEY = "veilbound-chronicle-v1";
const ONLINE_KEY = "veilbound-online-room-v1";

const DEFAULT_SETTINGS: UserSettings = {
  sound: true,
  haptics: true,
  reducedMotion: false,
  largeCards: false,
};

const DEFAULT_STATS: Chronicle = {
  games: 0,
  wins: 0,
  identitiesBound: 0,
  bestScore: 0,
};

const AI_NAMES = ["The Curator", "The Pale Seer", "The Archivist"];

interface PendingInvite {
  roomId: string;
  token: string;
}

interface TurnOutcome {
  id: string;
  kind: "transfer" | "draw" | "bind" | "empty";
  eyebrow: string;
  title: string;
  message: string;
  cards: VeilCard[];
  identityId: IdentityId;
  bound: IdentityId[];
  buttonLabel: "Continue turn" | "End turn" | "See final revelation";
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The Veil did not answer.");
  return payload;
}

function tone(enabled: boolean, kind: "tap" | "reveal" | "bind" | "deny") {
  if (!enabled || typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const frequencies = { tap: 310, reveal: 520, bind: 660, deny: 190 };
  oscillator.frequency.value = frequencies[kind];
  oscillator.type = kind === "deny" ? "sine" : "triangle";
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.055, audio.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.2);
  oscillator.onended = () => void audio.close();
}

function haptic(enabled: boolean, pattern: number | number[] = 12) {
  if (enabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function Crest({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "crest crestSmall" : "crest"} aria-hidden="true">
      <span className="crestLeaf crestLeafLeft" />
      <span className="crestMask"><i /><b /></span>
      <span className="crestLeaf crestLeafRight" />
    </span>
  );
}

function Ornament() {
  return <span className="ornament" aria-hidden="true"><i>✦</i></span>;
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="iconButton" type="button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function IdentityPortrait({ identityId, className = "" }: { identityId: IdentityId; className?: string }) {
  const identity = getIdentity(identityId);
  return (
    <span className={`identityPortrait ${className}`} style={{ "--identity-hue": identity.hue } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/identities/${identity.id}.webp`} alt="" draggable={false} />
      <span className="portraitFallback">{identity.sigil}</span>
    </span>
  );
}

function VeilCardView({
  card,
  selected,
  compact,
  entering,
  onClick,
}: {
  card: VeilCard;
  selected?: boolean;
  compact?: boolean;
  entering?: boolean;
  onClick?: () => void;
}) {
  const identity = getIdentity(card.identityId);
  const content = (
    <>
      <span className="cardCorner"><b>{identity.sigil}</b><i>◆</i></span>
      <IdentityPortrait identityId={card.identityId} className="cardPortrait" />
      <span className="cardWash" />
      <span className="cardCopy">
        <strong>{identity.name}</strong>
        <small>{card.echo}</small>
      </span>
      <span className="cardCorner cardCornerBottom"><b>{identity.sigil}</b><i>◆</i></span>
    </>
  );

  if (!onClick) {
    return <div className={`veilCard ${compact ? "compact" : ""} ${entering ? "cardEntering" : ""}`}>{content}</div>;
  }
  return (
    <button
      className={`veilCard selectable ${selected ? "selected" : ""} ${compact ? "compact" : ""} ${entering ? "cardEntering" : ""}`}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Choose ${identity.name}, ${card.echo}`}
    >
      {content}
    </button>
  );
}

function CardBack({ count, small = false }: { count?: number; small?: boolean }) {
  return (
    <div className={`cardBack ${small ? "cardBackSmall" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/card-back.webp" alt="Face-down Veil card" draggable={false} />
      {typeof count === "number" && <span className="deckCount">{count}</span>}
    </div>
  );
}

function outcomeButtonLabel(nextPlayer: number, actorIndex: number, status: "active" | "complete") {
  if (status === "complete") return "See final revelation" as const;
  return nextPlayer === actorIndex ? "Continue turn" as const : "End turn" as const;
}

function buildLocalOutcome(
  before: GameState,
  next: GameState,
  actorIndex: number,
  targetId: string,
  identityId: IdentityId,
): TurnOutcome {
  const actorBefore = before.players[actorIndex];
  const actorAfter = next.players[actorIndex];
  const target = before.players.find((player) => player.id === targetId)!;
  const offered = target.hand.filter((card) => card.identityId === identityId);
  const drawn = offered.length === 0 ? before.deck.at(-1) : undefined;
  const bound = actorAfter.bound.filter((id) => !actorBefore.bound.includes(id));
  const identity = getIdentity(bound[0] ?? identityId);
  const retained = next.status === "active" && next.currentPlayer === actorIndex;

  let kind: TurnOutcome["kind"] = offered.length ? "transfer" : drawn ? "draw" : "empty";
  let eyebrow = offered.length ? "Echoes revealed" : "Draw from the Veil";
  let title = offered.length
    ? `${offered.length} new ${offered.length === 1 ? "Echo" : "Echoes"}`
    : drawn
      ? `You drew ${getIdentity(drawn.identityId).name}`
      : "The Veil is empty";
  let message = offered.length
    ? `${target.name} surrendered every Echo of ${getIdentity(identityId).name} they held.`
    : drawn
      ? `${drawn.echo} has joined your hand.${retained ? " You earned another inquiry." : " Your turn is complete."}`
      : "No card remains to answer the inquiry.";

  if (bound.length) {
    kind = "bind";
    eyebrow = "Identity bound";
    title = `${identity.name} is complete`;
    message = `Memory, Desire, Fear, and Truth crossed the threshold and became one revelation.${retained ? " You may inquire again." : ""}`;
  }

  return {
    id: `${next.id}-${next.turn}-${next.events[0]?.id ?? Date.now()}`,
    kind,
    eyebrow,
    title,
    message,
    cards: offered.length ? offered : drawn ? [drawn] : [],
    identityId,
    bound,
    buttonLabel: outcomeButtonLabel(next.currentPlayer, actorIndex, next.status),
  };
}

function buildOnlineOutcome(
  before: OnlineGameView,
  next: OnlineGameView,
  seat: 0 | 1,
  identityId: IdentityId,
): TurnOutcome {
  const beforeIds = new Set(before.yourHand.map((card) => card.id));
  const cards = next.yourHand.filter((card) => !beforeIds.has(card.id));
  const bound = next.players[seat].bound.filter((id) => !before.players[seat].bound.includes(id));
  const opponentSeat = seat === 0 ? 1 : 0;
  const transferred = Math.max(0, before.players[opponentSeat].handCount - next.players[opponentSeat].handCount);
  const drew = next.deckCount < before.deckCount;
  const retained = next.status === "active" && next.currentPlayer === seat;
  const identity = getIdentity(bound[0] ?? identityId);

  let kind: TurnOutcome["kind"] = transferred ? "transfer" : drew ? "draw" : "empty";
  let eyebrow = transferred ? "Echoes revealed" : "Draw from the Veil";
  let title = transferred
    ? `${transferred} new ${transferred === 1 ? "Echo" : "Echoes"}`
    : cards[0]
      ? `You drew ${getIdentity(cards[0].identityId).name}`
      : drew
        ? "A new Echo answered"
        : "The Veil is empty";
  let message = transferred
    ? `Every matching ${getIdentity(identityId).name} Echo crossed into your hand.`
    : cards[0]
      ? `${cards[0].echo} has joined your hand.${retained ? " You earned another inquiry." : " Your turn is complete."}`
      : retained
        ? "The Veil answered your inquiry. You may ask again."
        : "Your inquiry is complete.";

  if (bound.length) {
    kind = "bind";
    eyebrow = "Identity bound";
    title = `${identity.name} is complete`;
    message = `All four Echoes crossed the threshold and became one revelation.${retained ? " You may inquire again." : ""}`;
  }

  return {
    id: `${next.id}-${next.turn}-${next.events[0]?.id ?? Date.now()}`,
    kind,
    eyebrow,
    title,
    message,
    cards,
    identityId,
    bound,
    buttonLabel: outcomeButtonLabel(next.currentPlayer, seat, next.status),
  };
}

function TurnResolution({ outcome, continueTurn }: { outcome: TurnOutcome; continueTurn: () => void }) {
  return (
    <div className={`turnResolution ${outcome.kind}`} role="dialog" aria-modal="true" aria-labelledby="turn-resolution-title">
      <section className="resolutionPanel">
        <span className="resolutionRings" aria-hidden="true"><i /><i /><i /></span>
        <p className="eyebrow">{outcome.eyebrow}</p>
        <h2 id="turn-resolution-title">{outcome.title}</h2>
        <div className="resolutionReveal" aria-hidden="true">
          {outcome.cards.length ? outcome.cards.map((card) => (
            <span key={card.id} className="receivedCard">
              <VeilCardView card={card} compact />
            </span>
          )) : (
            <span className="resolutionIdentity"><IdentityPortrait identityId={outcome.bound[0] ?? outcome.identityId} /></span>
          )}
          {outcome.bound.length > 0 && <span className="bindingMark"><i>✦</i><b>BOUND</b></span>}
        </div>
        <p className="resolutionMessage">{outcome.message}</p>
        <button className="resolutionAction" type="button" onClick={continueTurn}>
          <span>{outcome.buttonLabel}</span><i>→</i>
        </button>
      </section>
    </div>
  );
}

function RulesPanel({ close, tutorial }: { close: () => void; tutorial: () => void }) {
  return (
    <div className="modalScrim" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <section className="modalPanel rulesPanel">
        <button className="modalClose" type="button" onClick={close} aria-label="Close rules">×</button>
        <p className="eyebrow">The rite of inquiry</p>
        <h2 id="rules-title">How to play</h2>
        <Ornament />
        <ol className="ruleList">
          <li><b>Choose an identity</b><span>You may only inquire after an identity already held in your hand.</span></li>
          <li><b>Inquire of another seeker</b><span>Ask, “Do you hold The Warden?” If they do, every matching echo passes to you.</span></li>
          <li><b>Draw from the Veil</b><span>If they hold none, they answer “Draw from the Veil,” and you draw one card.</span></li>
          <li><b>Bind four echoes</b><span>Memory, Desire, Fear, and Truth complete an identity. Bound identities are safe and score one point.</span></li>
          <li><b>Claim the revelation</b><span>When all thirteen identities are bound, the seeker with the most wins.</span></li>
        </ol>
        <button className="primaryButton" type="button" onClick={tutorial}>Open the guided tutorial</button>
        <button className="ghostButton" type="button" onClick={close}>I understand</button>
      </section>
    </div>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  back,
}: {
  settings: UserSettings;
  setSettings: (settings: UserSettings) => void;
  back: () => void;
}) {
  const options: { key: keyof UserSettings; title: string; note: string }[] = [
    { key: "sound", title: "Whispered sound", note: "Subtle card and reveal tones" },
    { key: "haptics", title: "Haptic signs", note: "Gentle vibration on important actions" },
    { key: "reducedMotion", title: "Quiet motion", note: "Reduce flourishes and card movement" },
    { key: "largeCards", title: "Larger cards", note: "Increase hand size for easier reading" },
  ];
  return (
    <AppPage eyebrow="The chamber" title="Settings" back={back}>
      <div className="settingsList">
        {options.map((option) => (
          <button
            type="button"
            className="settingRow"
            key={option.key}
            onClick={() => setSettings({ ...settings, [option.key]: !settings[option.key] })}
          >
            <span><b>{option.title}</b><small>{option.note}</small></span>
            <i className={settings[option.key] ? "toggle on" : "toggle"}><em /></i>
          </button>
        ))}
      </div>
      <p className="finePrint">Preferences remain on this device.</p>
    </AppPage>
  );
}

function AppPage({
  eyebrow,
  title,
  back,
  children,
}: {
  eyebrow: string;
  title: string;
  back: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="appPage">
      <header className="pageHeader">
        <IconButton label="Go back" onClick={back}>‹</IconButton>
        <Crest small />
        <span className="headerSpacer" />
      </header>
      <div className="pageTitle">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <Ornament />
      </div>
      {children}
    </section>
  );
}

function TitleScreen({
  canContinue,
  onContinue,
  onPlay,
  onRules,
  onTutorial,
  onChronicle,
  onSettings,
}: {
  canContinue: boolean;
  onContinue: () => void;
  onPlay: () => void;
  onRules: () => void;
  onTutorial: () => void;
  onChronicle: () => void;
  onSettings: () => void;
}) {
  return (
    <section className="titleScreen">
      <div className="titleAtmosphere" aria-hidden="true"><i /><i /><i /></div>
      <div className="titleTopbar">
        <button className="textIcon" type="button" onClick={onRules}>Rules</button>
        <button className="textIcon" type="button" onClick={onSettings}>Settings</button>
      </div>
      <div className="titleMark">
        <Crest />
        <p className="eyebrow">A game of hidden identities</p>
        <h1>VEILBOUND</h1>
        <Ornament />
        <p className="titleLine">Every mask remembers.</p>
      </div>
      <div className="menuStack">
        {canContinue && (
          <button className="primaryButton continueButton" type="button" onClick={onContinue}>
            <span>Continue the rite</span><small>Return to your unfinished circle</small>
          </button>
        )}
        <button className={canContinue ? "secondaryButton" : "primaryButton"} type="button" onClick={onPlay}>
          Begin a new game
        </button>
        <button className="secondaryButton" type="button" onClick={onTutorial}>Learn to play</button>
        <button className="ghostButton" type="button" onClick={onChronicle}>Open the chronicle</button>
      </div>
      <p className="versionStamp">First Edition · 1.2</p>
    </section>
  );
}

function ModesScreen({
  back,
  solo,
  online,
  local,
}: {
  back: () => void;
  solo: () => void;
  online: () => void;
  local: () => void;
}) {
  return (
    <AppPage eyebrow="Choose your circle" title="Ways to play" back={back}>
      <div className="modeGrid">
        <button className="modeCard featured" type="button" onClick={solo}>
          <span className="modeArt soloArt" aria-hidden="true"><i /><b /></span>
          <span className="modeCopy"><small>One seeker · One or two keepers</small><strong>Solo inquiry</strong><em>Test your strategy against one masked rival or a full three-seat circle.</em></span>
          <span className="modeArrow">→</span>
        </button>
        <button className="modeCard onlineMode" type="button" onClick={online}>
          <span className="modeArt onlineArt" aria-hidden="true"><i /><b /><em>↗</em></span>
          <span className="modeCopy"><small>Two seekers · Two devices</small><strong>Private invitation</strong><em>Create a private link and send it through a MaskLife message or any chat.</em></span>
          <span className="modeArrow">→</span>
        </button>
        <button className="modeCard" type="button" onClick={local}>
          <span className="modeArt circleArt" aria-hidden="true"><i /><i /><i /></span>
          <span className="modeCopy"><small>Two to four seekers</small><strong>Shared circle</strong><em>Pass one device. Each hand remains hidden behind the Veil.</em></span>
          <span className="modeArrow">→</span>
        </button>
      </div>
      <p className="finePrint">Solo and Shared Circle work offline. Private invitations save every turn securely online.</p>
    </AppPage>
  );
}

function SoloSetup({
  back,
  start,
}: {
  back: () => void;
  start: (difficulty: Difficulty, botCount: 1 | 2) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("adept");
  const [botCount, setBotCount] = useState<1 | 2>(1);
  const choices: { id: Difficulty; name: string; note: string }[] = [
    { id: "novice", name: "Novice", note: "Curious, forgetful, forgiving" },
    { id: "adept", name: "Adept", note: "Observant and balanced" },
    { id: "seer", name: "Seer", note: "Patient, watchful, relentless" },
  ];
  return (
    <AppPage eyebrow="Solo inquiry" title="Choose your rivals" back={back}>
      <div className="rivalPortrait"><IdentityPortrait identityId="oracle" /><span className="rivalHalo" /></div>
      <h2 className="rivalName">{botCount === 1 ? "The Curator" : "The Curator & The Pale Seer"}</h2>
      <p className="rivalQuote">“Ask carefully. Every question leaves a trace.”</p>
      <p className="setupLabel">Masked rivals</p>
      <div className="playerCount botCount" aria-label="Number of computer-controlled rivals">
        {([1, 2] as const).map((value) => (
          <button key={value} type="button" className={botCount === value ? "active" : ""} onClick={() => setBotCount(value)}>
            {value} {value === 1 ? "bot" : "bots"}
          </button>
        ))}
      </div>
      <p className="setupLabel">Difficulty</p>
      <div className="segmented" aria-label="Difficulty">
        {choices.map((choice) => (
          <button key={choice.id} type="button" className={difficulty === choice.id ? "active" : ""} onClick={() => setDifficulty(choice.id)}>
            <b>{choice.name}</b><small>{choice.note}</small>
          </button>
        ))}
      </div>
      <button className="primaryButton setupStart" type="button" onClick={() => start(difficulty, botCount)}>Enter the circle</button>
    </AppPage>
  );
}

const TUTORIAL_CARD: VeilCard = {
  id: "tutorial-warden-memory",
  identityId: "warden",
  echo: "Memory",
};

const TUTORIAL_STEPS = [
  {
    eyebrow: "The objective",
    title: "Bind hidden identities",
    body: "The deck holds thirteen masked identities. Every identity has four Echoes—Memory, Desire, Fear, and Truth. Gather all four to bind that identity for one point.",
  },
  {
    eyebrow: "Read your hand",
    title: "Identity first, Echo second",
    body: "The portrait and title tell you which identity a card belongs to. The small label names its Echo. You may ask only for an identity already represented in your hand.",
  },
  {
    eyebrow: "Try the turn flow",
    title: "Tap, place, then ask",
    body: "First tap The Warden in your hand. Then tap the center seal to place it. Once the card is resting in the center, the final Ask button becomes available.",
  },
  {
    eyebrow: "When they reveal",
    title: "Take every matching Echo",
    body: "If your rival holds The Warden, every Warden Echo in their hand passes to you. A successful inquiry lets you ask again, so use public clues to build a streak.",
  },
  {
    eyebrow: "When they deny",
    title: "Draw from the Veil",
    body: "If they hold none, they answer “Draw from the Veil.” You draw one card and the turn usually passes. Draw the exact identity you requested and you earn another inquiry.",
  },
  {
    eyebrow: "Binding and scoring",
    title: "Four Echoes become one point",
    body: "Complete identities bind automatically and leave your hand. Empty hands refill while cards remain. When all thirteen identities are bound, the highest score wins; equal scores share the revelation.",
  },
  {
    eyebrow: "Choose your circle",
    title: "Three complete ways to play",
    body: "Train against one or two fair bots, pass one device among two to four people, or send a private invitation for a protected two-device match. Only your own online hand is ever sent to your screen.",
  },
] as const;

function TutorialScreen({ back, practice }: { back: () => void; practice: () => void }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const item = TUTORIAL_STEPS[step];
  const isGesture = step === 2;
  const last = step === TUTORIAL_STEPS.length - 1;

  const selectCard = () => {
    setSelected(true);
    setPrepared(false);
  };
  const prepareCard = () => {
    if (selected) setPrepared(true);
  };

  return (
    <AppPage eyebrow="Guided rite" title="Learn Veilbound" back={back}>
      <div className="tutorialProgress" aria-label={`Tutorial step ${step + 1} of ${TUTORIAL_STEPS.length}`}>
        {TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}
      </div>
      <section className="tutorialCard">
        <p className="eyebrow">{item.eyebrow}</p>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        <div className={`tutorialStage stage${step + 1}`}>
          {step === 0 && <div className="echoSet"><span>Memory</span><span>Desire</span><span>Fear</span><span>Truth</span></div>}
          {step === 1 && <VeilCardView card={TUTORIAL_CARD} />}
          {isGesture && (
            <>
              <VeilCardView
                card={TUTORIAL_CARD}
                selected={selected}
                onClick={selectCard}
              />
              <button
                type="button"
                className={`tutorialDrop ${prepared ? "prepared" : ""}`}
                onClick={prepareCard}
                aria-label={selected ? "Place The Warden in the center" : "Select The Warden first"}
              >
                <Crest small />
                <span>{prepared ? "The Warden is placed" : selected ? "Tap to place it here" : "First tap the card"}</span>
              </button>
            </>
          )}
          {step === 3 && <div className="tutorialTransfer"><span>1</span><b>→</b><span>3 Echoes</span></div>}
          {step === 4 && <div className="tutorialPhrase">“Draw from the Veil.”</div>}
          {step === 5 && <div className="tutorialScore"><Crest small /><strong>+1</strong><span>The Warden bound</span></div>}
          {step === 6 && <div className="tutorialModes"><span>1–2 bots</span><span>Pass & play</span><span>Private link</span></div>}
        </div>
        {isGesture && <p className="tutorialHint" aria-live="polite">{prepared ? "Perfect. The card is centered and the Ask button is now ready." : selected ? "Good. Now tap the center seal." : "Step 1: tap The Warden card."}</p>}
      </section>
      <div className="tutorialActions">
        {step > 0 && <button className="secondaryButton" type="button" onClick={() => setStep((value) => value - 1)}>Previous</button>}
        {!last && (
          <button className="primaryButton" type="button" disabled={isGesture && !prepared} onClick={() => setStep((value) => value + 1)}>
            Continue
          </button>
        )}
        {last && <button className="primaryButton" type="button" onClick={practice}>Practice against a Novice</button>}
      </div>
      <p className="finePrint">Step {step + 1} of {TUTORIAL_STEPS.length} · You can reopen this guide from Rules at any time.</p>
    </AppPage>
  );
}

function LocalSetup({ back, start }: { back: () => void; start: (names: string[]) => void }) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(["Seeker One", "Seeker Two", "Seeker Three", "Seeker Four"]);
  return (
    <AppPage eyebrow="Shared circle" title="Gather the seekers" back={back}>
      <div className="playerCount" aria-label="Player count">
        {[2, 3, 4].map((value) => (
          <button key={value} type="button" className={count === value ? "active" : ""} onClick={() => setCount(value)}>{value}</button>
        ))}
      </div>
      <div className="nameFields">
        {names.slice(0, count).map((name, index) => (
          <label key={index}>
            <span>Seeker {index + 1}</span>
            <input
              value={name}
              maxLength={18}
              onChange={(event) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
              aria-label={`Name for seeker ${index + 1}`}
            />
          </label>
        ))}
      </div>
      <div className="privacyNote"><Crest small /><span><b>Hands remain private</b><small>The screen seals itself whenever the device changes hands.</small></span></div>
      <button className="primaryButton setupStart" type="button" onClick={() => start(names.slice(0, count))}>Seat the circle</button>
    </AppPage>
  );
}

function OnlineLobby({
  invite,
  credentials,
  room,
  busy,
  error,
  create,
  join,
  leave,
  back,
}: {
  invite: PendingInvite | null;
  credentials: OnlineCredentials | null;
  room: OnlineRoomView | null;
  busy: boolean;
  error: string;
  create: (name: string) => void;
  join: (name: string) => void;
  leave: () => void;
  back: () => void;
}) {
  const [name, setName] = useState(invite ? "Seeker Two" : "You");
  const [shareState, setShareState] = useState("Send private invitation");
  const waiting = room?.status === "waiting" && credentials?.inviteUrl;

  const share = async () => {
    if (!credentials?.inviteUrl) return;
    const shareData = {
      title: "Join my Veilbound circle",
      text: "I opened a private Veilbound circle for us. Take the second seat:",
      url: credentials.inviteUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareState("Invitation sent");
      } else {
        await navigator.clipboard.writeText(credentials.inviteUrl);
        setShareState("Link copied—paste it into your message");
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(credentials.inviteUrl);
        setShareState("Link copied—paste it into your message");
      } catch {
        setShareState("Press and hold the link below to copy it");
      }
    }
  };

  if (credentials && !room) {
    return (
      <AppPage eyebrow="Private invitation" title="Finding your circle" back={back}>
        <div className="waitingSeal compactWaiting"><Crest /><span className="waitingPulse" /></div>
        <p className="lobbyCopy">The Veil is reconnecting this device to room {credentials.roomId}.</p>
        {error && <div className="onlineError" role="alert">{error}</div>}
        {error && <button className="dangerButton" type="button" onClick={leave}>Forget this room</button>}
      </AppPage>
    );
  }

  if (waiting) {
    return (
      <AppPage eyebrow="Private invitation" title="Waiting at the Veil" back={back}>
        <div className="waitingSeal"><Crest /><span className="waitingPulse" /><strong>{room.id}</strong><small>private room code</small></div>
        <h2 className="lobbyTitle">Your second seeker has been invited</h2>
        <p className="lobbyCopy">Send the link through a MaskLife message, text, or any private chat. The match begins automatically when they take their seat.</p>
        <button className="primaryButton shareInvite" type="button" onClick={share}>{shareState}</button>
        <div className="inviteLink" tabIndex={0}>{credentials.inviteUrl}</div>
        <div className="privacyNote"><Crest small /><span><b>Private by possession</b><small>Anyone with this link can take the second seat. Send it only to the person you want to play.</small></span></div>
        <button className="dangerButton" type="button" onClick={leave}>Leave this invitation</button>
      </AppPage>
    );
  }

  const joining = Boolean(invite);
  return (
    <AppPage eyebrow={joining ? "You were invited" : "Two devices · One circle"} title={joining ? "Take the second seat" : "Open a private circle"} back={back}>
      <div className="onlineHero"><span className="onlineDevice"><i /></span><b>↔</b><span className="onlineDevice"><i /></span></div>
      <p className="lobbyCopy">
        {joining
          ? `Room ${invite?.roomId} is waiting. Choose the name your partner will see.`
          : "Create a protected room, then send one private link. Each player sees only their own hand, and every turn stays synchronized."}
      </p>
      <div className="nameFields onlineName">
        <label>
          <span>Your name at the table</span>
          <input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
        </label>
      </div>
      {error && <div className="onlineError" role="alert">{error}</div>}
      <button className="primaryButton setupStart" type="button" disabled={busy || !name.trim()} onClick={() => joining ? join(name) : create(name)}>
        {busy ? "Parting the Veil…" : joining ? "Join the circle" : "Create invitation"}
      </button>
      <div className="privacyNote"><Crest small /><span><b>No account required</b><small>The private link is the key. Your opponent’s cards never leave the protected game service.</small></span></div>
    </AppPage>
  );
}

function ChronicleScreen({ stats, back }: { stats: Chronicle; back: () => void }) {
  const winRate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;
  return (
    <AppPage eyebrow="Your record" title="The chronicle" back={back}>
      <div className="chronicleSeal"><Crest /><span>{stats.bestScore}</span><small>best revelation</small></div>
      <div className="statGrid">
        <article><strong>{stats.games}</strong><span>rites completed</span></article>
        <article><strong>{stats.wins}</strong><span>victories</span></article>
        <article><strong>{winRate}%</strong><span>win rate</span></article>
        <article><strong>{stats.identitiesBound}</strong><span>identities bound</span></article>
      </div>
      <blockquote>“A name remembered is a door left open.”</blockquote>
      <p className="finePrint">The chronicle is kept only on this device.</p>
    </AppPage>
  );
}

function OpponentMedallion({
  player,
  active,
  target,
  selectable,
  onClick,
}: {
  player: {
    id: string;
    name: string;
    hand?: VeilCard[];
    handCount?: number;
    bound: IdentityId[];
  };
  active: boolean;
  target: boolean;
  selectable: boolean;
  onClick: () => void;
}) {
  const portraitId = IDENTITIES[(Number(player.id.split("-")[1]) * 3) % IDENTITIES.length].id;
  return (
    <button
      type="button"
      className={`opponent ${active ? "active" : ""} ${target ? "target" : ""}`}
      onClick={onClick}
      disabled={!selectable}
      aria-pressed={target}
    >
      <span className="medallion"><IdentityPortrait identityId={portraitId} /></span>
      <strong>{player.name}</strong>
      <span className="opponentCounts"><i>{player.handCount ?? player.hand?.length ?? 0} cards</i><i>{player.bound.length} bound</i></span>
    </button>
  );
}

function BoundRow({ player }: { player: { name: string; bound: IdentityId[] } }) {
  return (
    <div className="boundRow" aria-label={`${player.name === "You" ? "You have" : `${player.name} has`} ${player.bound.length} bound identities`}>
      {player.bound.length === 0 ? (
        <span className="emptyBound">No identities bound</span>
      ) : (
        player.bound.map((identityId) => (
          <span key={identityId} title={getIdentity(identityId).name}><IdentityPortrait identityId={identityId} /></span>
        ))
      )}
    </div>
  );
}

function PassCurtain({ playerName, reveal }: { playerName: string; reveal: () => void }) {
  return (
    <div className="passCurtain" role="dialog" aria-modal="true" aria-labelledby="pass-title">
      <div className="curtainVeil curtainLeft" /><div className="curtainVeil curtainRight" />
      <Crest />
      <p className="eyebrow">Pass the device</p>
      <h2 id="pass-title">{playerName}</h2>
      <p>Only {playerName} should see the next hand.</p>
      <button className="primaryButton" type="button" onClick={reveal}>Reveal my hand</button>
    </div>
  );
}

function PauseMenu({
  resume,
  rules,
  settings,
  title,
  abandon,
  abandonLabel = "Abandon this rite",
}: {
  resume: () => void;
  rules: () => void;
  settings: () => void;
  title: () => void;
  abandon: () => void;
  abandonLabel?: string;
}) {
  return (
    <div className="modalScrim" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <section className="modalPanel pausePanel">
        <Crest />
        <p className="eyebrow">The rite is held</p>
        <h2 id="pause-title">Pause</h2>
        <button className="primaryButton" type="button" onClick={resume}>Return to the circle</button>
        <button className="secondaryButton" type="button" onClick={rules}>Review the rules</button>
        <button className="secondaryButton" type="button" onClick={settings}>Settings</button>
        <button className="ghostButton" type="button" onClick={title}>Save and leave</button>
        <button className="dangerButton" type="button" onClick={abandon}>{abandonLabel}</button>
      </section>
    </div>
  );
}

function HistoryPanel({ game, close }: { game: Pick<GameState, "events"> | Pick<OnlineGameView, "events">; close: () => void }) {
  return (
    <div className="modalScrim historyScrim" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <section className="modalPanel historyPanel">
        <button className="modalClose" type="button" onClick={close} aria-label="Close history">×</button>
        <p className="eyebrow">What the Veil remembers</p>
        <h2 id="history-title">Whispers</h2>
        <div className="historyList">
          {game.events.length ? game.events.map((event) => (
            <article key={event.id} className={event.success === true ? "success" : event.success === false ? "denied" : ""}>
              <i>Turn {event.turn}</i><p>{event.text}</p>
            </article>
          )) : <p className="emptyHistory">No questions have been asked.</p>}
        </div>
      </section>
    </div>
  );
}

function Results({
  game,
  rematch,
  title,
}: {
  game: GameState;
  rematch: () => void;
  title: () => void;
}) {
  const sorted = [...game.players].sort((a, b) => b.bound.length - a.bound.length);
  const isTie = game.winnerIds.length > 1;
  return (
    <div className="modalScrim resultScrim" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <section className="modalPanel resultPanel">
        <div className="resultGlow" aria-hidden="true" />
        <Crest />
        <p className="eyebrow">The final revelation</p>
        <h2 id="result-title">{isTie ? "The circle is divided" : sorted[0]?.name === "You" ? "You prevail" : `${sorted[0]?.name} prevails`}</h2>
        <p className="resultLead">{isTie ? "Two wills leave the Veil in perfect balance." : "The greatest collection of hidden identities has been bound."}</p>
        <div className="scoreList">
          {sorted.map((player, index) => (
            <article key={player.id} className={game.winnerIds.includes(player.id) ? "winner" : ""}>
              <span>{index + 1}</span><b>{player.name}</b><strong>{player.bound.length}</strong><small>bound</small>
            </article>
          ))}
        </div>
        <button className="primaryButton" type="button" onClick={rematch}>Begin a rematch</button>
        <button className="ghostButton" type="button" onClick={title}>Return to the threshold</button>
      </section>
    </div>
  );
}

function GameTable({
  game,
  settings,
  updateGame,
  openPause,
  openHistory,
}: {
  game: GameState;
  settings: UserSettings;
  updateGame: (game: GameState, previousPlayer: number) => void;
  openPause: () => void;
  openHistory: () => void;
}) {
  const actor = game.players[game.currentPlayer];
  const viewer = game.mode === "solo"
    ? (game.players.find((player) => player.kind === "human") ?? actor)
    : actor;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placedCardId, setPlacedCardId] = useState<string | null>(null);
  const [selectionTurn, setSelectionTurn] = useState(game.turn);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null);
  const [pendingGame, setPendingGame] = useState<GameState | null>(null);
  const [pendingNewCardIds, setPendingNewCardIds] = useState<string[]>([]);
  const [newCardIds, setNewCardIds] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validIdentities = useMemo(() => validInquiryIdentities(game, viewer.id), [game, viewer.id]);
  const targets = game.players.filter((player) => player.id !== actor.id && player.hand.length > 0);
  const displayedOpponents = game.mode === "solo"
    ? game.players.filter((player) => player.kind === "ai")
    : game.players.filter((player) => player.id !== actor.id);
  const selectionIsCurrent = selectionTurn === game.turn && actor.id === viewer.id;
  const selectedCard = selectionIsCurrent ? viewer.hand.find((card) => card.id === selectedCardId) ?? null : null;
  const placedCard = selectionIsCurrent ? viewer.hand.find((card) => card.id === placedCardId) ?? null : null;
  const effectiveIdentity = placedCard && validIdentities.includes(placedCard.identityId)
    ? placedCard.identityId
    : null;
  const effectiveTarget = targets.some((player) => player.id === targetId)
    ? targetId
    : (targets[0]?.id ?? "");
  const target = targets.find((player) => player.id === effectiveTarget) ?? null;
  const canAct = actor.kind === "human"
    && actor.id === viewer.id
    && !busy
    && !pendingGame
    && game.status === "active";

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
  }, []);

  const chooseCard = (card: VeilCard) => {
    if (!canAct) return;
    tone(settings.sound, "tap");
    haptic(settings.haptics, 8);
    setSelectionTurn(game.turn);
    setSelectedCardId(card.id);
    setPlacedCardId(null);
  };

  const placeCard = () => {
    if (!canAct || !selectedCard) return;
    tone(settings.sound, "reveal");
    haptic(settings.haptics, [8, 24, 12]);
    setPlacedCardId((current) => current === selectedCard.id ? null : selectedCard.id);
  };

  const inquire = () => {
    if (!canAct || !effectiveIdentity || !effectiveTarget || !placedCard) return;
    tone(settings.sound, "tap");
    haptic(settings.haptics);
    setBusy(true);
    const beforePlayer = game.currentPlayer;
    timerRef.current = setTimeout(() => {
      const next = resolveInquiry(game, {
        actorId: actor.id,
        targetId: effectiveTarget,
        identityId: effectiveIdentity,
      });
      const latest = next.events[0];
      const beforeIds = new Set(game.players[beforePlayer].hand.map((card) => card.id));
      const enteringIds = next.players[beforePlayer].hand
        .filter((card) => !beforeIds.has(card.id))
        .map((card) => card.id);
      tone(settings.sound, latest?.success ? "reveal" : "deny");
      haptic(settings.haptics, latest?.success ? [15, 35, 18] : 20);
      setPendingGame(next);
      setPendingNewCardIds(enteringIds);
      setOutcome(buildLocalOutcome(game, next, beforePlayer, effectiveTarget, effectiveIdentity));
      setBusy(false);
    }, settings.reducedMotion ? 80 : 420);
  };

  const continueTurn = () => {
    if (!pendingGame) return;
    const beforePlayer = game.currentPlayer;
    setNewCardIds(pendingNewCardIds);
    updateGame(pendingGame, beforePlayer);
    setPendingGame(null);
    setPendingNewCardIds([]);
    setOutcome(null);
    setSelectedCardId(null);
    setPlacedCardId(null);
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    entryTimerRef.current = setTimeout(
      () => setNewCardIds([]),
      settings.reducedMotion ? 30 : 1050,
    );
  };

  const sortedHand = sortHand(viewer.hand);
  const selected = selectedCard ? getIdentity(selectedCard.identityId) : null;
  const placed = placedCard ? getIdentity(placedCard.identityId) : null;
  const turnInstruction = !canAct
    ? actor.kind === "ai" ? `${actor.name} is considering the table` : `Waiting for ${actor.name}`
    : !selectedCard
      ? "Step 1 · Tap a card in your hand"
      : !placedCard
        ? `Step 2 · Tap the center to place ${selected?.name}`
        : `Step 3 · Ask ${target?.name ?? "a seeker"}`;

  return (
    <>
      <section className="gameTable">
        <header className="gameHeader">
          <IconButton label="Pause game" onClick={openPause}>☰</IconButton>
          <div className="gameWordmark"><Crest small /><span><b>VEILBOUND</b><small>Turn {game.turn}</small></span></div>
          <IconButton label="Open turn history" onClick={openHistory}>⌛</IconButton>
        </header>

        <div className="opponents" data-count={targets.length}>
          {displayedOpponents.map((player) => (
            <OpponentMedallion
              key={player.id}
              player={player}
              active={game.players[game.currentPlayer].id === player.id}
              target={canAct && effectiveTarget === player.id}
              selectable={canAct && targets.length > 1 && player.hand.length > 0}
              onClick={() => setTargetId(player.id)}
            />
          ))}
        </div>

        <div key={game.events[0]?.id ?? "opening"} className="messageRibbon eventRibbon" aria-live="polite">
          <i className="ribbonFlourish" aria-hidden="true" />
          <p>{busy ? `${actor.name} reaches toward the Veil…` : game.lastMessage}</p>
        </div>

        <div className="tableCenter">
          <div className="boundSummary">
            <span>{viewer.name}</span>
            <BoundRow player={viewer} />
          </div>
          <button
            className={`centerSeal ${selectedCard ? "readyToPlace" : ""} ${placedCard ? "placed" : ""}`}
            type="button"
            onClick={placeCard}
            disabled={!canAct || !selectedCard}
            aria-label={placedCard ? `Remove ${placed?.name} from the center` : selectedCard ? `Place ${selected?.name} in the center` : "Select a card first"}
          >
            <span className="centerSealGlow" />
            {placedCard ? <VeilCardView card={placedCard} compact /> : <Crest small />}
            <small>{placedCard ? `${placed?.name} placed` : selectedCard ? `Tap to place ${selected?.name}` : "Select a card below"}</small>
          </button>
          <button key={game.deck.length} className="deckButton deckChanged" type="button" aria-label={`${game.deck.length} cards remain in the Veil`} disabled>
            <span className="deckHalo" />
            <CardBack count={game.deck.length} />
            <small>The Veil</small>
          </button>
        </div>

        <div className={`handPanel ${settings.largeCards ? "largeCards" : ""}`}>
          <div className="handHeader">
            <span><b>{viewer.name === "You" ? "Your hand" : `${viewer.name}’s hand`}</b><small>{viewer.hand.length} echoes</small></span>
            <span className="scorePill">{viewer.bound.length} bound</span>
          </div>
          <div className="turnSteps" aria-label="Turn steps">
            <span className={selectedCard ? "done" : "active"}><i>1</i>Tap card</span>
            <span className={placedCard ? "done" : selectedCard ? "active" : ""}><i>2</i>Tap center</span>
            <span className={placedCard ? "active" : ""}><i>3</i>Ask</span>
          </div>
          <div className="cardFan" role="list" aria-label={viewer.name === "You" ? "Your cards" : `${viewer.name}’s cards`}>
            {sortedHand.map((card) => (
              <VeilCardView
                key={card.id}
                card={card}
                selected={selectedCard?.id === card.id}
                entering={newCardIds.includes(card.id)}
                onClick={canAct ? () => chooseCard(card) : undefined}
              />
            ))}
          </div>

          <div className="inquiryBar">
            <div className="inquiryChoice">
              <small>{turnInstruction}</small>
              <strong>{placed?.name ?? selected?.name ?? "Choose an Echo"}</strong>
            </div>
            <button className="inquireButton" type="button" onClick={inquire} disabled={!canAct || !effectiveIdentity || !effectiveTarget || !placedCard}>
              <span>{busy ? "REVEALING…" : placedCard ? `ASK ${target?.name?.toUpperCase() ?? "NOW"}` : selectedCard ? "PLACE IN CENTER" : "CHOOSE A CARD"}</span>
              <i>✦</i>
            </button>
          </div>
        </div>
      </section>
      {outcome && <TurnResolution outcome={outcome} continueTurn={continueTurn} />}
    </>
  );
}

function OnlineResults({
  game,
  seat,
  rematch,
  title,
}: {
  game: OnlineGameView;
  seat: 0 | 1;
  rematch: () => void;
  title: () => void;
}) {
  const sorted = [...game.players].sort((a, b) => b.bound.length - a.bound.length);
  const you = game.players[seat];
  const isTie = game.winnerIds.length > 1;
  const youWon = game.winnerIds.includes(you.id);
  return (
    <div className="modalScrim resultScrim" role="dialog" aria-modal="true" aria-labelledby="online-result-title">
      <section className="modalPanel resultPanel">
        <div className="resultGlow" aria-hidden="true" />
        <Crest />
        <p className="eyebrow">The final revelation</p>
        <h2 id="online-result-title">{isTie ? "The circle is divided" : youWon ? "You prevail" : `${sorted[0]?.name} prevails`}</h2>
        <p className="resultLead">{isTie ? "Two wills leave the Veil in perfect balance." : "Both devices have witnessed the final binding."}</p>
        <div className="scoreList">
          {sorted.map((player, index) => (
            <article key={player.id} className={game.winnerIds.includes(player.id) ? "winner" : ""}>
              <span>{index + 1}</span><b>{player.id === you.id ? `${player.name} · You` : player.name}</b><strong>{player.bound.length}</strong><small>bound</small>
            </article>
          ))}
        </div>
        <button className="primaryButton" type="button" onClick={rematch}>Begin an online rematch</button>
        <button className="ghostButton" type="button" onClick={title}>Return to the threshold</button>
      </section>
    </div>
  );
}

function OnlineGameTable({
  room,
  settings,
  error,
  act,
  openPause,
  openHistory,
}: {
  room: OnlineRoomView;
  settings: UserSettings;
  error: string;
  act: (action: OnlineAction) => Promise<OnlineRoomView | undefined>;
  openPause: () => void;
  openHistory: () => void;
}) {
  const game = room.game!;
  const you = game.players[room.seat];
  const opponent = game.players[room.seat === 0 ? 1 : 0];
  const actor = game.players[game.currentPlayer];
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placedCardId, setPlacedCardId] = useState<string | null>(null);
  const [selectionTurn, setSelectionTurn] = useState(game.turn);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null);
  const [pendingNewCardIds, setPendingNewCardIds] = useState<string[]>([]);
  const [newCardIds, setNewCardIds] = useState<string[]>([]);
  const entryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionIsCurrent = selectionTurn === game.turn && game.currentPlayer === room.seat;
  const selectedCard = selectionIsCurrent ? game.yourHand.find((card) => card.id === selectedCardId) ?? null : null;
  const placedCard = selectionIsCurrent ? game.yourHand.find((card) => card.id === placedCardId) ?? null : null;
  const effectiveIdentity = placedCard?.identityId ?? null;
  const selected = selectedCard ? getIdentity(selectedCard.identityId) : null;
  const placed = placedCard ? getIdentity(placedCard.identityId) : null;
  const canAct = game.status === "active" && game.currentPlayer === room.seat && !busy && !outcome;

  useEffect(() => () => {
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
  }, []);

  const chooseCard = (card: VeilCard) => {
    if (!canAct) return;
    tone(settings.sound, "tap");
    haptic(settings.haptics, 8);
    setSelectionTurn(game.turn);
    setSelectedCardId(card.id);
    setPlacedCardId(null);
  };

  const placeCard = () => {
    if (!canAct || !selectedCard) return;
    tone(settings.sound, "reveal");
    haptic(settings.haptics, [8, 24, 12]);
    setPlacedCardId((current) => current === selectedCard.id ? null : selectedCard.id);
  };

  const inquire = async () => {
    if (!canAct || !effectiveIdentity || !opponent || !placedCard) return;
    setBusy(true);
    tone(settings.sound, "tap");
    haptic(settings.haptics);
    try {
      const nextRoom = await act({
        type: "inquire",
        version: room.version,
        targetId: opponent.id,
        identityId: effectiveIdentity,
      });
      if (nextRoom?.game) {
        const beforeIds = new Set(game.yourHand.map((card) => card.id));
        setPendingNewCardIds(nextRoom.game.yourHand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id));
        setOutcome(buildOnlineOutcome(game, nextRoom.game, room.seat, effectiveIdentity));
      }
    } finally {
      setBusy(false);
    }
  };

  const continueTurn = () => {
    setNewCardIds(pendingNewCardIds);
    setPendingNewCardIds([]);
    setOutcome(null);
    setSelectedCardId(null);
    setPlacedCardId(null);
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    entryTimerRef.current = setTimeout(
      () => setNewCardIds([]),
      settings.reducedMotion ? 30 : 1050,
    );
  };

  const turnInstruction = !canAct
    ? game.currentPlayer !== room.seat ? `Waiting for ${actor.name}` : "The Veil is resolving your inquiry"
    : !selectedCard
      ? "Step 1 · Tap a card in your hand"
      : !placedCard
        ? `Step 2 · Tap the center to place ${selected?.name}`
        : `Step 3 · Ask ${opponent.name}`;

  return (
    <>
      <section className="gameTable onlineTable">
        <header className="gameHeader">
          <IconButton label="Pause game" onClick={openPause}>☰</IconButton>
          <div className="gameWordmark"><Crest small /><span><b>VEILBOUND</b><small>Online · Turn {game.turn}</small></span></div>
          <IconButton label="Open turn history" onClick={openHistory}>⌛</IconButton>
        </header>

        <div className="onlineStatus"><i className="connectedDot" />Private room {room.id} · synchronized</div>
        <div className="opponents" data-count="1">
          <OpponentMedallion
            player={opponent}
            active={game.currentPlayer !== room.seat}
            target={game.currentPlayer === room.seat}
            selectable={false}
            onClick={() => undefined}
          />
        </div>

        <div key={game.events[0]?.id ?? "opening"} className="messageRibbon eventRibbon" aria-live="polite">
          <i className="ribbonFlourish" aria-hidden="true" />
          <p>{busy ? "Your inquiry crosses the Veil…" : game.currentPlayer !== room.seat && game.status === "active" ? `${actor.name} is choosing an inquiry…` : game.lastMessage}</p>
        </div>
        {error && <div className="onlineToast" role="status">{error}</div>}

        <div className="tableCenter">
          <div className="boundSummary">
            <span>Your bindings</span>
            <BoundRow player={you} />
          </div>
          <button
            className={`centerSeal ${selectedCard ? "readyToPlace" : ""} ${placedCard ? "placed" : ""}`}
            type="button"
            onClick={placeCard}
            disabled={!canAct || !selectedCard}
            aria-label={placedCard ? `Remove ${placed?.name} from the center` : selectedCard ? `Place ${selected?.name} in the center` : "Select a card first"}
          >
            <span className="centerSealGlow" />
            {placedCard ? <VeilCardView card={placedCard} compact /> : <Crest small />}
            <small>{placedCard ? `${placed?.name} placed` : selectedCard ? `Tap to place ${selected?.name}` : "Select a card below"}</small>
          </button>
          <button key={game.deckCount} className="deckButton deckChanged" type="button" aria-label={`${game.deckCount} cards remain in the Veil`} disabled>
            <span className="deckHalo" />
            <CardBack count={game.deckCount} />
            <small>The Veil</small>
          </button>
        </div>

        <div className={`handPanel ${settings.largeCards ? "largeCards" : ""}`}>
          <div className="handHeader">
            <span><b>Your hand</b><small>{game.yourHand.length} private echoes</small></span>
            <span className="scorePill">{you.bound.length} bound</span>
          </div>
          <div className="turnSteps" aria-label="Turn steps">
            <span className={selectedCard ? "done" : "active"}><i>1</i>Tap card</span>
            <span className={placedCard ? "done" : selectedCard ? "active" : ""}><i>2</i>Tap center</span>
            <span className={placedCard ? "active" : ""}><i>3</i>Ask</span>
          </div>
          <div className="cardFan" role="list" aria-label="Your private cards">
            {sortHand(game.yourHand).map((card) => (
              <VeilCardView
                key={card.id}
                card={card}
                selected={selectedCard?.id === card.id}
                entering={newCardIds.includes(card.id)}
                onClick={canAct ? () => chooseCard(card) : undefined}
              />
            ))}
          </div>

          <div className="inquiryBar">
            <div className="inquiryChoice">
              <small>{turnInstruction}</small>
              <strong>{placed?.name ?? selected?.name ?? "Choose an Echo"}</strong>
            </div>
            <button className="inquireButton" type="button" onClick={inquire} disabled={!canAct || !effectiveIdentity || !placedCard}>
              <span>{busy ? "REVEALING…" : placedCard ? `ASK ${opponent.name.toUpperCase()}` : selectedCard ? "PLACE IN CENTER" : game.currentPlayer === room.seat ? "CHOOSE A CARD" : "WAITING…"}</span>
              <i>✦</i>
            </button>
          </div>
        </div>
      </section>
      {outcome && <TurnResolution outcome={outcome} continueTurn={continueTurn} />}
    </>
  );
}

export default function VeilboundGame() {
  const [screen, setScreen] = useState<Screen>("title");
  const [game, setGame] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Chronicle>(DEFAULT_STATS);
  const [ready, setReady] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privacyCurtain, setPrivacyCurtain] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState<"title" | "game" | "online-setup">("title");
  const [onlineCredentials, setOnlineCredentials] = useState<OnlineCredentials | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomView | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingGame = useRef<string | undefined>(undefined);
  const recordingOnlineGame = useRef<string | undefined>(undefined);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        const savedStats = localStorage.getItem(STATS_KEY);
        const savedOnline = localStorage.getItem(ONLINE_KEY);
        if (saved) setGame(JSON.parse(saved) as GameState);
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
        if (savedStats) setStats({ ...DEFAULT_STATS, ...JSON.parse(savedStats) });
        const query = new URLSearchParams(window.location.search);
        const roomId = query.get("room")?.trim().toUpperCase() ?? "";
        const token = query.get("key")?.trim() ?? "";
        if (roomId && token) {
          setPendingInvite({ roomId, token });
          setScreen("online-setup");
        } else if (savedOnline) {
          setOnlineCredentials(JSON.parse(savedOnline) as OnlineCredentials);
        }
      } catch {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(ONLINE_KEY);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.documentElement.dataset.motion = settings.reducedMotion ? "quiet" : "full";
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return;
    if (game) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    else localStorage.removeItem(SAVE_KEY);
  }, [game, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [ready, stats]);

  useEffect(() => {
    if (!ready || screen !== "online-setup" || !onlineCredentials) return;
    let active = true;
    const credentials = onlineCredentials;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/rooms/${credentials.roomId}`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
          cache: "no-store",
        });
        const payload = await responseJson<{ room: OnlineRoomView }>(response);
        if (active) {
          setOnlineRoom(payload.room);
          setOnlineError("");
        }
      } catch (error) {
        if (active) setOnlineError(error instanceof Error ? error.message : "The circle could not be reached.");
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 1400);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [onlineCredentials, ready, screen]);

  useEffect(() => {
    if (
      !game ||
      game.status !== "complete" ||
      stats.lastGameId === game.id ||
      recordingGame.current === game.id
    ) return;
    recordingGame.current = game.id;
    const human = game.players[0];
    const record = window.setTimeout(() => {
      setStats((current) => current.lastGameId === game.id ? current : ({
        games: current.games + 1,
        wins: current.wins + (game.winnerIds.includes(human.id) ? 1 : 0),
        identitiesBound: current.identitiesBound + human.bound.length,
        bestScore: Math.max(current.bestScore, human.bound.length),
        lastGameId: game.id,
      }));
      tone(settings.sound, "bind");
      haptic(settings.haptics, [30, 50, 30, 50, 60]);
    }, 0);
    return () => window.clearTimeout(record);
  }, [game, settings.haptics, settings.sound, stats.lastGameId]);

  useEffect(() => {
    const onlineGame = onlineRoom?.game;
    if (
      !onlineGame ||
      onlineGame.status !== "complete" ||
      stats.lastGameId === onlineGame.id ||
      recordingOnlineGame.current === onlineGame.id
    ) return;
    recordingOnlineGame.current = onlineGame.id;
    const you = onlineGame.players[onlineRoom.seat];
    const record = window.setTimeout(() => {
      setStats((current) => current.lastGameId === onlineGame.id ? current : ({
        games: current.games + 1,
        wins: current.wins + (onlineGame.winnerIds.includes(you.id) ? 1 : 0),
        identitiesBound: current.identitiesBound + you.bound.length,
        bestScore: Math.max(current.bestScore, you.bound.length),
        lastGameId: onlineGame.id,
      }));
      tone(settings.sound, "bind");
      haptic(settings.haptics, [30, 50, 30, 50, 60]);
    }, 0);
    return () => window.clearTimeout(record);
  }, [onlineRoom, settings.haptics, settings.sound, stats.lastGameId]);

  useEffect(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (!game || screen !== "game" || pauseOpen || historyOpen || rulesOpen || game.status !== "active") return;
    const actor = game.players[game.currentPlayer];
    if (actor.kind !== "ai") return;
    aiTimer.current = setTimeout(() => {
      const choice = chooseAIInquiry(game);
      if (!choice) return;
      const next = resolveInquiry(game, choice);
      setGame(next);
      tone(settings.sound, next.events[0]?.success ? "reveal" : "deny");
    }, settings.reducedMotion ? 280 : 1050);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [game, historyOpen, pauseOpen, rulesOpen, screen, settings.reducedMotion, settings.sound]);

  const beginGame = (next: GameState) => {
    tone(settings.sound, "reveal");
    haptic(settings.haptics, [12, 28, 18]);
    setGame(next);
    setPrivacyCurtain(next.mode === "local");
    setScreen("game");
  };

  const startSolo = (difficulty: Difficulty, botCount: 1 | 2) => {
    beginGame(createGame([
      { name: "You", kind: "human" },
      ...AI_NAMES.slice(0, botCount).map((name) => ({ name, kind: "ai" as const })),
    ], { mode: "solo", difficulty }));
  };

  const startLocal = (names: string[]) => {
    beginGame(createGame(names.map((name) => ({ name, kind: "human" as const })), { mode: "local" }));
  };

  const rememberOnline = (credentials: OnlineCredentials) => {
    setOnlineCredentials(credentials);
    localStorage.setItem(ONLINE_KEY, JSON.stringify(credentials));
  };

  const clearInviteQuery = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("key");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const createOnline = async (name: string) => {
    setOnlineBusy(true);
    setOnlineError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await responseJson<{ room: OnlineRoomView; credentials: OnlineCredentials }>(response);
      rememberOnline(payload.credentials);
      setOnlineRoom(payload.room);
      setPendingInvite(null);
      tone(settings.sound, "reveal");
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "The invitation could not be created.");
    } finally {
      setOnlineBusy(false);
    }
  };

  const joinOnline = async (name: string) => {
    if (!pendingInvite) return;
    setOnlineBusy(true);
    setOnlineError("");
    try {
      const response = await fetch(`/api/rooms/${pendingInvite.roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, token: pendingInvite.token }),
      });
      const payload = await responseJson<{ room: OnlineRoomView }>(response);
      rememberOnline({ roomId: pendingInvite.roomId, token: pendingInvite.token });
      setOnlineRoom(payload.room);
      setPendingInvite(null);
      clearInviteQuery();
      tone(settings.sound, "reveal");
      haptic(settings.haptics, [15, 35, 18]);
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "The invitation could not be joined.");
    } finally {
      setOnlineBusy(false);
    }
  };

  const applyOnline = async (action: OnlineAction) => {
    if (!onlineCredentials) return;
    setOnlineError("");
    try {
      const response = await fetch(`/api/rooms/${onlineCredentials.roomId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onlineCredentials.token}`,
        },
        body: JSON.stringify(action),
      });
      const payload = await responseJson<{ room: OnlineRoomView }>(response);
      const priorTurn = onlineRoom?.game?.turn;
      setOnlineRoom(payload.room);
      if (payload.room.game?.turn !== priorTurn) haptic(settings.haptics, 16);
      tone(settings.sound, payload.room.game?.events[0]?.success ? "reveal" : "deny");
      return payload.room;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The inquiry could not cross the Veil.";
      setOnlineError(message);
      try {
        const refresh = await fetch(`/api/rooms/${onlineCredentials.roomId}`, {
          headers: { Authorization: `Bearer ${onlineCredentials.token}` },
          cache: "no-store",
        });
        const payload = await responseJson<{ room: OnlineRoomView }>(refresh);
        setOnlineRoom(payload.room);
      } catch {
        // Keep the actionable message from the original request.
      }
      return undefined;
    }
  };

  const leaveOnline = () => {
    localStorage.removeItem(ONLINE_KEY);
    setOnlineCredentials(null);
    setOnlineRoom(null);
    setPendingInvite(null);
    setOnlineError("");
    setPauseOpen(false);
    clearInviteQuery();
    setScreen("title");
  };

  const backFromOnline = () => {
    if (pendingInvite) {
      setPendingInvite(null);
      clearInviteQuery();
    }
    setScreen(onlineCredentials ? "title" : "modes");
  };

  const updateGame = (next: GameState, previousPlayer: number) => {
    setGame(next);
    if (next.mode === "local" && next.status === "active" && next.currentPlayer !== previousPlayer) {
      setPrivacyCurtain(true);
    }
  };

  const rematch = () => {
    if (!game) return;
    const seeds = game.players.map((player) => ({ name: player.name, kind: player.kind }));
    beginGame(createGame(seeds, { mode: game.mode, difficulty: game.difficulty }));
  };

  const abandon = () => {
    setGame(null);
    setPauseOpen(false);
    setScreen("title");
  };

  const saveAndLeave = () => {
    setPauseOpen(false);
    setScreen("title");
  };

  const openTutorial = () => {
    setRulesOpen(false);
    setPauseOpen(false);
    setHistoryOpen(false);
    setScreen("tutorial");
  };

  if (!ready) {
    return <main className="veilboundApp loadingScreen"><Crest /><p>Finding the circle…</p></main>;
  }

  return (
    <main className="veilboundApp">
      <div className="ambientGrain" aria-hidden="true" />
      <div className="appShell">
        {screen === "title" && (
          <TitleScreen
            canContinue={Boolean(onlineCredentials || game?.status === "active")}
            onContinue={() => {
              if (onlineCredentials) {
                setScreen("online-setup");
              } else {
                setScreen("game");
                setPrivacyCurtain(game?.mode === "local");
              }
            }}
            onPlay={() => setScreen("modes")}
            onRules={() => setRulesOpen(true)}
            onTutorial={openTutorial}
            onChronicle={() => setScreen("chronicle")}
            onSettings={() => { setSettingsReturn("title"); setScreen("settings"); }}
          />
        )}
        {screen === "modes" && (
          <ModesScreen
            back={() => setScreen("title")}
            solo={() => setScreen("solo-setup")}
            online={() => { setOnlineError(""); setScreen("online-setup"); }}
            local={() => setScreen("local-setup")}
          />
        )}
        {screen === "solo-setup" && <SoloSetup back={() => setScreen("modes")} start={startSolo} />}
        {screen === "tutorial" && <TutorialScreen back={() => setScreen("title")} practice={() => startSolo("novice", 1)} />}
        {screen === "local-setup" && <LocalSetup back={() => setScreen("modes")} start={startLocal} />}
        {screen === "online-setup" && !onlineRoom?.game && (
          <OnlineLobby
            invite={pendingInvite}
            credentials={onlineCredentials}
            room={onlineRoom}
            busy={onlineBusy}
            error={onlineError}
            create={createOnline}
            join={joinOnline}
            leave={leaveOnline}
            back={backFromOnline}
          />
        )}
        {screen === "online-setup" && onlineRoom?.game && (
          <OnlineGameTable
            room={onlineRoom}
            settings={settings}
            error={onlineError}
            act={applyOnline}
            openPause={() => setPauseOpen(true)}
            openHistory={() => setHistoryOpen(true)}
          />
        )}
        {screen === "chronicle" && <ChronicleScreen stats={stats} back={() => setScreen("title")} />}
        {screen === "settings" && <SettingsPanel settings={settings} setSettings={setSettings} back={() => setScreen(settingsReturn)} />}
        {screen === "game" && game && (
          <GameTable game={game} settings={settings} updateGame={updateGame} openPause={() => setPauseOpen(true)} openHistory={() => setHistoryOpen(true)} />
        )}
      </div>

      {rulesOpen && <RulesPanel close={() => setRulesOpen(false)} tutorial={openTutorial} />}
      {pauseOpen && screen === "game" && game && (
        <PauseMenu
          resume={() => setPauseOpen(false)}
          rules={() => setRulesOpen(true)}
          settings={() => { setSettingsReturn("game"); setPauseOpen(false); setScreen("settings"); }}
          title={saveAndLeave}
          abandon={abandon}
        />
      )}
      {pauseOpen && screen === "online-setup" && onlineRoom?.game && (
        <PauseMenu
          resume={() => setPauseOpen(false)}
          rules={() => setRulesOpen(true)}
          settings={() => { setSettingsReturn("online-setup"); setPauseOpen(false); setScreen("settings"); }}
          title={saveAndLeave}
          abandon={leaveOnline}
          abandonLabel="Leave this room"
        />
      )}
      {historyOpen && screen === "game" && game && <HistoryPanel game={game} close={() => setHistoryOpen(false)} />}
      {historyOpen && screen === "online-setup" && onlineRoom?.game && <HistoryPanel game={onlineRoom.game} close={() => setHistoryOpen(false)} />}
      {screen === "game" && game?.mode === "local" && privacyCurtain && game.status === "active" && (
        <PassCurtain playerName={game.players[game.currentPlayer].name} reveal={() => setPrivacyCurtain(false)} />
      )}
      {screen === "game" && game?.status === "complete" && <Results game={game} rematch={rematch} title={() => { setScreen("title"); }} />}
      {screen === "online-setup" && onlineRoom?.game?.status === "complete" && (
        <OnlineResults
          game={onlineRoom.game}
          seat={onlineRoom.seat}
          rematch={() => void applyOnline({ type: "rematch", version: onlineRoom.version })}
          title={() => setScreen("title")}
        />
      )}
    </main>
  );
}
