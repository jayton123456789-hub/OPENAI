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

type Screen =
  | "title"
  | "modes"
  | "solo-setup"
  | "local-setup"
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
  onClick,
}: {
  card: VeilCard;
  selected?: boolean;
  compact?: boolean;
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
    return <div className={`veilCard ${compact ? "compact" : ""}`}>{content}</div>;
  }
  return (
    <button
      className={`veilCard selectable ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
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

function RulesPanel({ close }: { close: () => void }) {
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
        <button className="primaryButton" type="button" onClick={close}>I understand</button>
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
  onChronicle,
  onSettings,
}: {
  canContinue: boolean;
  onContinue: () => void;
  onPlay: () => void;
  onRules: () => void;
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
        <button className="ghostButton" type="button" onClick={onChronicle}>Open the chronicle</button>
      </div>
      <p className="versionStamp">First Edition · 1.0</p>
    </section>
  );
}

function ModesScreen({ back, solo, local }: { back: () => void; solo: () => void; local: () => void }) {
  return (
    <AppPage eyebrow="Choose your circle" title="Ways to play" back={back}>
      <div className="modeGrid">
        <button className="modeCard featured" type="button" onClick={solo}>
          <span className="modeArt soloArt" aria-hidden="true"><i /><b /></span>
          <span className="modeCopy"><small>One seeker · One keeper</small><strong>Solo inquiry</strong><em>Outwit a masked opponent who remembers your questions.</em></span>
          <span className="modeArrow">→</span>
        </button>
        <button className="modeCard" type="button" onClick={local}>
          <span className="modeArt circleArt" aria-hidden="true"><i /><i /><i /></span>
          <span className="modeCopy"><small>Two to four seekers</small><strong>Shared circle</strong><em>Pass one device. Each hand remains hidden behind the Veil.</em></span>
          <span className="modeArrow">→</span>
        </button>
      </div>
      <p className="finePrint">Both modes work completely offline and save after every turn.</p>
    </AppPage>
  );
}

function SoloSetup({ back, start }: { back: () => void; start: (difficulty: Difficulty) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("adept");
  const choices: { id: Difficulty; name: string; note: string }[] = [
    { id: "novice", name: "Novice", note: "Curious, forgetful, forgiving" },
    { id: "adept", name: "Adept", note: "Observant and balanced" },
    { id: "seer", name: "Seer", note: "Patient, watchful, relentless" },
  ];
  return (
    <AppPage eyebrow="Solo inquiry" title="Choose your rival" back={back}>
      <div className="rivalPortrait"><IdentityPortrait identityId="oracle" /><span className="rivalHalo" /></div>
      <h2 className="rivalName">The Curator</h2>
      <p className="rivalQuote">“Ask carefully. Every question leaves a trace.”</p>
      <div className="segmented" aria-label="Difficulty">
        {choices.map((choice) => (
          <button key={choice.id} type="button" className={difficulty === choice.id ? "active" : ""} onClick={() => setDifficulty(choice.id)}>
            <b>{choice.name}</b><small>{choice.note}</small>
          </button>
        ))}
      </div>
      <button className="primaryButton setupStart" type="button" onClick={() => start(difficulty)}>Enter the circle</button>
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
  player: GameState["players"][number];
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
      <span className="opponentCounts"><i>{player.hand.length} cards</i><i>{player.bound.length} bound</i></span>
    </button>
  );
}

function BoundRow({ player }: { player: GameState["players"][number] }) {
  return (
    <div className="boundRow" aria-label={`${player.name} has ${player.bound.length} bound identities`}>
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
}: {
  resume: () => void;
  rules: () => void;
  settings: () => void;
  title: () => void;
  abandon: () => void;
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
        <button className="dangerButton" type="button" onClick={abandon}>Abandon this rite</button>
      </section>
    </div>
  );
}

function HistoryPanel({ game, close }: { game: GameState; close: () => void }) {
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
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityId | null>(null);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validIdentities = useMemo(() => validInquiryIdentities(game, actor.id), [game, actor.id]);
  const targets = game.players.filter((player) => player.id !== actor.id && player.hand.length > 0);
  const effectiveIdentity =
    selectedIdentity && validIdentities.includes(selectedIdentity)
      ? selectedIdentity
      : (validIdentities[0] ?? null);
  const effectiveTarget = targets.some((player) => player.id === targetId)
    ? targetId
    : (targets[0]?.id ?? "");
  const canAct = actor.kind === "human" && !busy && game.status === "active";

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const inquire = () => {
    if (!canAct || !effectiveIdentity || !effectiveTarget) return;
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
      tone(settings.sound, latest?.success ? "reveal" : "deny");
      haptic(settings.haptics, latest?.success ? [15, 35, 18] : 20);
      updateGame(next, beforePlayer);
      setBusy(false);
    }, settings.reducedMotion ? 80 : 420);
  };

  const sortedHand = sortHand(actor.hand);
  const selected = effectiveIdentity ? getIdentity(effectiveIdentity) : null;

  return (
    <section className="gameTable">
      <header className="gameHeader">
        <IconButton label="Pause game" onClick={openPause}>☰</IconButton>
        <div className="gameWordmark"><Crest small /><span><b>VEILBOUND</b><small>Turn {game.turn}</small></span></div>
        <IconButton label="Open turn history" onClick={openHistory}>⌛</IconButton>
      </header>

      <div className="opponents" data-count={targets.length}>
        {game.players.filter((player) => player.id !== actor.id).map((player) => (
          <OpponentMedallion
            key={player.id}
            player={player}
            active={game.players[game.currentPlayer].id === player.id}
            target={effectiveTarget === player.id}
            selectable={canAct && targets.length > 1 && player.hand.length > 0}
            onClick={() => setTargetId(player.id)}
          />
        ))}
      </div>

      <div className="messageRibbon" aria-live="polite">
        <i className="ribbonFlourish" aria-hidden="true" />
        <p>{busy ? `${actor.name} reaches toward the Veil…` : game.lastMessage}</p>
      </div>

      <div className="tableCenter">
        <div className="boundSummary">
          <span>{actor.name}</span>
          <BoundRow player={actor} />
        </div>
        <button className="deckButton" type="button" aria-label={`${game.deck.length} cards remain in the Veil`} disabled>
          <span className="deckHalo" />
          <CardBack count={game.deck.length} />
          <small>The Veil</small>
        </button>
      </div>

      <div className={`handPanel ${settings.largeCards ? "largeCards" : ""}`}>
        <div className="handHeader">
          <span><b>{actor.name}&apos;s hand</b><small>{actor.hand.length} echoes</small></span>
          <span className="scorePill">{actor.bound.length} bound</span>
        </div>
        <div className="cardFan" role="list" aria-label={`${actor.name}'s cards`}>
          {sortedHand.map((card) => (
            <VeilCardView
              key={card.id}
              card={card}
              selected={effectiveIdentity === card.identityId}
              onClick={() => canAct && setSelectedIdentity(card.identityId)}
            />
          ))}
        </div>

        <div className="inquiryBar">
          <div className="inquiryChoice">
            <small>Inquire after</small>
            <strong>{selected?.name ?? "No identity"}</strong>
          </div>
          <button className="inquireButton" type="button" onClick={inquire} disabled={!canAct || !effectiveIdentity || !effectiveTarget}>
            <span>{actor.kind === "ai" ? "Listening…" : busy ? "Inquiring…" : "INQUIRE"}</span>
            <i>✦</i>
          </button>
        </div>
      </div>
    </section>
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
  const [settingsReturn, setSettingsReturn] = useState<"title" | "game">("title");
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingGame = useRef<string | undefined>(undefined);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        const savedStats = localStorage.getItem(STATS_KEY);
        if (saved) setGame(JSON.parse(saved) as GameState);
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
        if (savedStats) setStats({ ...DEFAULT_STATS, ...JSON.parse(savedStats) });
      } catch {
        localStorage.removeItem(SAVE_KEY);
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

  const startSolo = (difficulty: Difficulty) => {
    beginGame(createGame([
      { name: "You", kind: "human" },
      { name: AI_NAMES[0], kind: "ai" },
    ], { mode: "solo", difficulty }));
  };

  const startLocal = (names: string[]) => {
    beginGame(createGame(names.map((name) => ({ name, kind: "human" as const })), { mode: "local" }));
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

  if (!ready) {
    return <main className="veilboundApp loadingScreen"><Crest /><p>Finding the circle…</p></main>;
  }

  return (
    <main className="veilboundApp">
      <div className="ambientGrain" aria-hidden="true" />
      <div className="appShell">
        {screen === "title" && (
          <TitleScreen
            canContinue={Boolean(game?.status === "active")}
            onContinue={() => { setScreen("game"); setPrivacyCurtain(game?.mode === "local"); }}
            onPlay={() => setScreen("modes")}
            onRules={() => setRulesOpen(true)}
            onChronicle={() => setScreen("chronicle")}
            onSettings={() => { setSettingsReturn("title"); setScreen("settings"); }}
          />
        )}
        {screen === "modes" && <ModesScreen back={() => setScreen("title")} solo={() => setScreen("solo-setup")} local={() => setScreen("local-setup")} />}
        {screen === "solo-setup" && <SoloSetup back={() => setScreen("modes")} start={startSolo} />}
        {screen === "local-setup" && <LocalSetup back={() => setScreen("modes")} start={startLocal} />}
        {screen === "chronicle" && <ChronicleScreen stats={stats} back={() => setScreen("title")} />}
        {screen === "settings" && <SettingsPanel settings={settings} setSettings={setSettings} back={() => setScreen(settingsReturn)} />}
        {screen === "game" && game && (
          <GameTable game={game} settings={settings} updateGame={updateGame} openPause={() => setPauseOpen(true)} openHistory={() => setHistoryOpen(true)} />
        )}
      </div>

      {rulesOpen && <RulesPanel close={() => setRulesOpen(false)} />}
      {pauseOpen && game && (
        <PauseMenu
          resume={() => setPauseOpen(false)}
          rules={() => setRulesOpen(true)}
          settings={() => { setSettingsReturn("game"); setPauseOpen(false); setScreen("settings"); }}
          title={saveAndLeave}
          abandon={abandon}
        />
      )}
      {historyOpen && game && <HistoryPanel game={game} close={() => setHistoryOpen(false)} />}
      {screen === "game" && game?.mode === "local" && privacyCurtain && game.status === "active" && (
        <PassCurtain playerName={game.players[game.currentPlayer].name} reveal={() => setPrivacyCurtain(false)} />
      )}
      {screen === "game" && game?.status === "complete" && <Results game={game} rematch={rematch} title={() => { setScreen("title"); }} />}
    </main>
  );
}
