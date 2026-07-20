"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BALLS_PER_ROUND,
  chooseRealmAIShot,
  createRealmGame,
  getCurrentRealmBall,
  getCurrentRealmRound,
  getRealmTarget,
  REALM_ROUNDS,
  REALM_TARGETS,
  remainingRealmBalls,
  RealmDifficulty,
  RealmGameState,
  RealmShot,
  RealmShotAction,
  RealmTarget,
  resolveRealmShot,
  upgradeRealmGameState,
} from "@/lib/realm-roll";
import type {
  RealmOnlineCredentials,
  RealmOnlineGameView,
  RealmRoomView,
} from "@/lib/realm-online-room";

type Screen = "title" | "modes" | "solo" | "local" | "online" | "tutorial" | "chronicle" | "settings" | "game";
type ShotPhase = "aim" | "power" | "accuracy" | "rolling";

interface Settings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

interface Chronicle {
  games: number;
  wins: number;
  totalScore: number;
  highScore: number;
  perfectShots: number;
  lastGameId?: string;
}

interface ShotOutcome {
  id: string;
  playerName: string;
  playerScore: number;
  shot: RealmShot;
  target: RealmTarget;
  final: boolean;
}

interface PendingInvite {
  roomId: string;
  token: string;
}

type OnlineActionInput =
  | { type: "shoot"; targetId: string; power: number; accuracy: number }
  | { type: "rematch" };

const SAVE_KEY = "realm-roll-skeeball-save-v2";
const SETTINGS_KEY = "realm-roll-settings-v2";
const STATS_KEY = "realm-roll-chronicle-v2";
const ONLINE_KEY = "realm-roll-online-room-v2";

const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, reducedMotion: false, highContrast: false };
const DEFAULT_STATS: Chronicle = { games: 0, wins: 0, totalScore: 0, highScore: 0, perfectShots: 0 };
const AI_NAMES = ["The Lane Warden", "The High Roller", "The Ramp Seer"];

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The lane did not answer.");
  return payload;
}

function tone(enabled: boolean, kind: "tap" | "lock" | "roll" | "score" | "miss") {
  if (!enabled || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const frequency = { tap: 300, lock: 430, roll: 180, score: 680, miss: 145 }[kind];
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === "roll" ? 1.9 : 1.08), audio.currentTime + .18);
  oscillator.type = kind === "roll" ? "sawtooth" : "triangle";
  gain.gain.setValueAtTime(.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.045, audio.currentTime + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .22);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .23);
  oscillator.onended = () => void audio.close();
}

function haptic(enabled: boolean, pattern: number | number[] = 10) {
  if (enabled && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

function CrownMark({ small = false }: { small?: boolean }) {
  return <span className={`realmCrownMark ${small ? "small" : ""}`} aria-hidden="true"><i /><i /><i /><b>✦</b></span>;
}

function RealmBall({ small = false }: { small?: boolean }) {
  return <span className={`realmBall ${small ? "small" : ""}`} aria-hidden="true"><i>✦</i></span>;
}

function ScoreTrack({ score, max }: { score: number; max: number }) {
  const width = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return <span className="skeeScoreTrack"><i style={{ width: `${width}%` }} /></span>;
}

function Page({ eyebrow, title, back, children }: { eyebrow: string; title: string; back: () => void; children: React.ReactNode }) {
  return (
    <section className="realmPage skeePage">
      <header className="realmPageHeader"><button type="button" aria-label="Go back" onClick={back}>‹</button><CrownMark small /><span /></header>
      <div className="realmPageTitle"><p>{eyebrow}</p><h1>{title}</h1><i>✦</i></div>
      {children}
    </section>
  );
}

function MiniLane({ activeTarget = "crown", interactive = false, choose }: { activeTarget?: string; interactive?: boolean; choose?: (targetId: string) => void }) {
  return (
    <div className="miniSkeeLane">
      <div className="miniBackboard">
        {REALM_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            className={activeTarget === target.id ? "active" : ""}
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, "--target-hue": target.hue } as React.CSSProperties}
            onClick={() => choose?.(target.id)}
            disabled={!interactive}
            aria-label={`${target.name}, ${target.points} points`}
          >{target.points}</button>
        ))}
      </div>
      <span className="miniRamp"><i /><i /><RealmBall small /></span>
    </div>
  );
}

function TitleScreen({ canContinue, onContinue, onPlay, onRules, onTutorial, onChronicle, onSettings }: {
  canContinue: boolean; onContinue: () => void; onPlay: () => void; onRules: () => void; onTutorial: () => void; onChronicle: () => void; onSettings: () => void;
}) {
  return (
    <section className="realmTitleScreen skeeTitleScreen">
      <div className="realmStars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <header className="realmTitleTopbar"><span><Link href="/">Games</Link><button type="button" onClick={onRules}>Rules</button></span><button type="button" onClick={onSettings}>Settings</button></header>
      <div className="skeeHero">
        <MiniLane />
        <p>A fantasy Skee-Ball game</p>
        <h1>REALM <b>ROLL</b></h1>
        <span><i />Choose your realm. Rule the lane.<i /></span>
      </div>
      <div className="realmMenu">
        {canContinue && <button className="realmPrimary" type="button" onClick={onContinue}><b>Continue the match</b><small>Return to your unfinished lane</small></button>}
        <button className={canContinue ? "realmSecondary" : "realmPrimary"} type="button" onClick={onPlay}>Start a new match</button>
        <button className="realmSecondary" type="button" onClick={onTutorial}>Learn to roll</button>
        <button className="realmGhost" type="button" onClick={onChronicle}>Open the score ledger</button>
      </div>
      <p className="realmVersion">First Edition · Skee-Ball</p>
    </section>
  );
}

function Modes({ back, solo, online, local }: { back: () => void; solo: () => void; online: () => void; local: () => void }) {
  return (
    <Page eyebrow="Choose your lane" title="Ways to play" back={back}>
      <div className="realmModeGrid">
        <button className="realmMode featured" type="button" onClick={solo}><span className="realmModeArt skeeSoloArt"><RealmBall /><i>AI</i></span><span><small>One roller · One or two rivals</small><strong>Solo lane</strong><em>Face fair AI that changes risk based on the score.</em></span><b>→</b></button>
        <button className="realmMode online" type="button" onClick={online}><span className="realmModeArt devices"><i /><i /><b>↗</b></span><span><small>Two rollers · Two devices</small><strong>Private lane</strong><em>Send your boyfriend a link and alternate every ball.</em></span><b>→</b></button>
        <button className="realmMode" type="button" onClick={local}><span className="realmModeArt skeeLocalArt"><RealmBall /><RealmBall /></span><span><small>Two to four rollers</small><strong>Pass the lane</strong><em>Share one phone with clear handoff screens.</em></span><b>→</b></button>
      </div>
      <p className="realmFinePrint">Every match has three rounds of five balls per player. Ties enter Sudden Roll.</p>
    </Page>
  );
}

function SoloSetup({ back, start }: { back: () => void; start: (difficulty: RealmDifficulty, bots: 1 | 2) => void }) {
  const [difficulty, setDifficulty] = useState<RealmDifficulty>("adept");
  const [bots, setBots] = useState<1 | 2>(1);
  const choices: { id: RealmDifficulty; name: string; note: string }[] = [
    { id: "novice", name: "Novice", note: "A relaxed, imperfect rival" },
    { id: "adept", name: "Adept", note: "Balances safe and risky targets" },
    { id: "royal", name: "Royal", note: "Precise and pressure-aware" },
  ];
  return (
    <Page eyebrow="Solo lane" title="Choose your rivals" back={back}>
      <div className="skeeRivalHero"><MiniLane activeTarget="moon" /><span>W</span></div>
      <h2 className="realmRivalName">{bots === 1 ? "The Lane Warden" : "The Lane Warden & The High Roller"}</h2>
      <p className="realmQuote">“A safe ten cannot catch a royal hundred.”</p>
      <p className="realmSetupLabel">Rivals</p>
      <div className="realmSegments compact">{([1, 2] as const).map((count) => <button type="button" key={count} className={bots === count ? "active" : ""} onClick={() => setBots(count)}>{count} {count === 1 ? "bot" : "bots"}</button>)}</div>
      <p className="realmSetupLabel">Difficulty</p>
      <div className="realmSegments">{choices.map((choice) => <button type="button" key={choice.id} className={difficulty === choice.id ? "active" : ""} onClick={() => setDifficulty(choice.id)}><b>{choice.name}</b><small>{choice.note}</small></button>)}</div>
      <button className="realmPrimary setup" type="button" onClick={() => start(difficulty, bots)}>Open the lane</button>
    </Page>
  );
}

function LocalSetup({ back, start }: { back: () => void; start: (names: string[]) => void }) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(["You", "Roller Two", "Roller Three", "Roller Four"]);
  return (
    <Page eyebrow="Pass the lane" title="Seat your rollers" back={back}>
      <div className="skeeLocalHero"><MiniLane activeTarget="river" /></div>
      <p className="realmSetupLabel">Number of rollers</p>
      <div className="realmSegments compact three">{[2, 3, 4].map((value) => <button type="button" key={value} className={count === value ? "active" : ""} onClick={() => setCount(value)}>{value}</button>)}</div>
      <div className="realmNameList">{names.slice(0, count).map((name, index) => <label key={index}><span>{index + 1}</span><input value={name} maxLength={18} onChange={(event) => setNames(names.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} aria-label={`Roller ${index + 1} name`} /></label>)}</div>
      <button className="realmPrimary setup" type="button" onClick={() => start(names.slice(0, count))}>Start the match</button>
    </Page>
  );
}

const TUTORIAL_STEPS = [
  { eyebrow: "The match", title: "Three rounds. Five balls each.", body: "Every roller gets 15 regulation balls. Score as much as you can; the highest total wins after the final frame." },
  { eyebrow: "Choose a realm", title: "Tap a scoring ring", body: "Aim for a safe 10, climb through 20–50, or risk a tiny 100-point Dragon Gate in either top corner." },
  { eyebrow: "Set the distance", title: "Lock your power", body: "Each realm has a highlighted power zone. Stop the moving marker inside it so the ball reaches the right height." },
  { eyebrow: "Keep it straight", title: "Lock your accuracy", body: "Stop the second marker near the center. Left or right timing moves the ball across the backboard." },
  { eyebrow: "Watch the roll", title: "The ball follows your timing", body: "A clean power and accuracy lock reaches the chosen ring. Near misses can still fall into another scoring realm." },
  { eyebrow: "Risk and reward", title: "Dragon Gates score 100", body: "They are much smaller and require near-perfect power. Use them when you need a comeback—or when you feel fearless." },
  { eyebrow: "A tied crown", title: "Sudden Roll settles ties", body: "Tied leaders receive one ball each. They repeat until only one roller remains ahead." },
  { eyebrow: "Every lane", title: "Play your way", body: "Practice against score-aware AI, pass one phone among four rollers, or send a private two-device invitation." },
];

function Tutorial({ back, practice }: { back: () => void; practice: () => void }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState("crown");
  const item = TUTORIAL_STEPS[step];
  return (
    <Page eyebrow="Guided lesson" title="Learn Realm Roll" back={back}>
      <div className="realmTutorialProgress">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}</div>
      <article className="realmTutorialCard skeeTutorialCard">
        <p>{item.eyebrow}</p><h2>{item.title}</h2><span>{item.body}</span>
        <div className="realmTutorialStage skeeTutorialStage">
          {step === 0 && <div className="roundLesson"><strong>3</strong><span>ROUNDS</span><i>×</i><strong>5</strong><span>BALLS</span><b>= 15 SHOTS</b></div>}
          {step === 1 && <MiniLane activeTarget={target} interactive choose={setTarget} />}
          {step === 2 && <div className="meterLesson"><span><i className="idealZone" style={{ left: "68%" }} /><b className="lessonNeedle power" /></span><strong>POWER</strong><small>Stop inside the gold zone</small></div>}
          {step === 3 && <div className="meterLesson"><span><i className="accuracyZone" /><b className="lessonNeedle accuracy" /></span><strong>ACCURACY</strong><small>Center keeps the ball straight</small></div>}
          {step === 4 && <div className="lessonRoll"><MiniLane activeTarget="moon" /><RealmBall /><b>+40</b></div>}
          {step === 5 && <div className="dragonLesson"><span>100<small>DRAGON</small></span><b>or</b><span>100<small>WYVERN</small></span></div>}
          {step === 6 && <div className="suddenLesson"><RealmBall /><strong>SUDDEN ROLL</strong><RealmBall /><small>ONE BALL EACH</small></div>}
          {step === 7 && <div className="tutorialModesRealm"><span>SOLO<small>Score-aware AI</small></span><span>PRIVATE<small>Two devices</small></span><span>LOCAL<small>2–4 rollers</small></span></div>}
        </div>
        {step === 1 && <p className="realmTutorialHint">Tap any scoring ring. The highlighted ring is your target.</p>}
      </article>
      <div className="realmTutorialActions">{step > 0 && <button className="realmGhost" type="button" onClick={() => setStep(step - 1)}>Back</button>}{step < TUTORIAL_STEPS.length - 1 ? <button className="realmPrimary" type="button" onClick={() => setStep(step + 1)}>Next lesson</button> : <button className="realmPrimary" type="button" onClick={practice}>Practice against a Novice</button>}</div>
    </Page>
  );
}

function ChroniclePage({ stats, back }: { stats: Chronicle; back: () => void }) {
  return (
    <Page eyebrow="Lifetime scores" title="The lane ledger" back={back}>
      <div className="skeeLedgerHero"><RealmBall /><strong>{stats.highScore}</strong><span>HIGH SCORE</span></div>
      <div className="ledgerGrid">
        <span><b>{stats.games}</b><small>Matches played</small></span>
        <span><b>{stats.wins}</b><small>Matches won</small></span>
        <span><b>{stats.totalScore}</b><small>Total points</small></span>
        <span><b>{stats.perfectShots}</b><small>Perfect rolls</small></span>
      </div>
      <p className="realmFinePrint">This ledger stays on this device.</p>
    </Page>
  );
}

function SettingsPage({ settings, setSettings, back }: { settings: Settings; setSettings: (settings: Settings) => void; back: () => void }) {
  const options: { key: keyof Settings; title: string; note: string }[] = [
    { key: "sound", title: "Lane sounds", note: "Soft roll and score tones" },
    { key: "haptics", title: "Haptics", note: "Timing feedback on supported phones" },
    { key: "reducedMotion", title: "Quiet motion", note: "Simplify rolling and meter animation" },
    { key: "highContrast", title: "High contrast", note: "Brighten rings and meter zones" },
  ];
  return (
    <Page eyebrow="On this device" title="Settings" back={back}>
      <div className="realmSettingsList">{options.map((option) => <button type="button" key={option.key} onClick={() => setSettings({ ...settings, [option.key]: !settings[option.key] })}><span><b>{option.title}</b><small>{option.note}</small></span><i className={settings[option.key] ? "on" : ""}><em /></i></button>)}</div>
      <p className="realmFinePrint">Preferences remain on this device.</p>
    </Page>
  );
}

type TableView = RealmGameState | RealmOnlineGameView;

function SkeeLane({ selectedTarget, choose, lastShot, rolling, interactive }: {
  selectedTarget: string; choose: (targetId: string) => void; lastShot: RealmShot | null; rolling: boolean; interactive: boolean;
}) {
  return (
    <div className="skeeMachine">
      <div className="skeeCanopy"><span>THE SEVEN REALMS</span><i>✦</i></div>
      <div className="skeeBackboard">
        <div className="backboardRings" aria-hidden="true"><i /><i /><i /></div>
        {REALM_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            className={`${selectedTarget === target.id ? "selected" : ""} ${target.points === 100 ? "dragonHole" : ""}`}
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, "--target-hue": target.hue, "--hole-size": `${Math.max(42, target.radius * 390)}px` } as React.CSSProperties}
            onClick={() => choose(target.id)}
            disabled={!interactive}
            aria-pressed={selectedTarget === target.id}
            aria-label={`Aim for ${target.name}, ${target.points} points`}
          ><b>{target.points}</b><small>{target.shortName}</small></button>
        ))}
        {lastShot && (
          <span
            key={lastShot.id}
            className={`impactBall ${rolling ? "rolling" : "settled"} ${lastShot.points ? "scored" : "missed"}`}
            style={{ "--impact-x": `${lastShot.impactX * 100}%`, "--impact-y": `${lastShot.impactY * 100}%` } as React.CSSProperties}
          ><i>✦</i></span>
        )}
      </div>
      <div className="skeeRamp"><i /><i /><i /><span className="launchBall"><RealmBall small /></span></div>
    </div>
  );
}

function PlayerScoreRail({ view }: { view: TableView }) {
  const maxScore = Math.max(100, ...view.players.map((player) => player.score));
  return (
    <div className="skeePlayerScores">{view.players.map((player, index) => <span key={player.id} className={index === view.currentPlayer ? "active" : ""}><i>{index + 1}</i><b>{player.name}</b><ScoreTrack score={player.score} max={maxScore} /><strong>{player.score}</strong></span>)}</div>
  );
}

function TimingMeter({ kind, idealPower }: { kind: "power" | "accuracy"; idealPower: number }) {
  return (
    <div className={`timingMeter ${kind}`}>
      <span className="meterLabels"><small>{kind === "power" ? "SOFT" : "LEFT"}</small><b>{kind === "power" ? "POWER" : "ACCURACY"}</b><small>{kind === "power" ? "HARD" : "RIGHT"}</small></span>
      <div className="meterTrack">
        {kind === "power" ? <i className="idealPowerZone" style={{ left: `${idealPower * 100}%` }} /> : <i className="idealAccuracyZone" />}
        <b className="movingNeedle" />
      </div>
      <p>{kind === "power" ? "Stop the marker in the gold zone." : "Stop the marker in the center."}</p>
    </div>
  );
}

function GameTable({ view, seat, selectedTarget, phase, power, interactive, busy, online, settings, chooseTarget, beginPower, lockPower, shoot, openPause, openHistory }: {
  view: TableView; seat?: number; selectedTarget: string; phase: ShotPhase; power: number; interactive: boolean; busy?: boolean; online?: boolean; settings: Settings;
  chooseTarget: (targetId: string) => void; beginPower: () => void; lockPower: () => void; shoot: () => void; openPause: () => void; openHistory: () => void;
}) {
  const actor = view.players[view.currentPlayer];
  const target = getRealmTarget(selectedTarget || "meadow");
  const round = view.suddenDeath ? `SUDDEN ${view.suddenDeathRound}` : `ROUND ${getCurrentRealmRound(view as RealmGameState)} OF ${REALM_ROUNDS}`;
  const ball = view.suddenDeath ? "ONE BALL" : `BALL ${getCurrentRealmBall(view as RealmGameState)} OF ${BALLS_PER_ROUND}`;
  const viewer = view.players[typeof seat === "number" ? seat : view.currentPlayer];
  const usedThisRound = view.suddenDeath ? 0 : viewer.shotsTaken % BALLS_PER_ROUND;
  return (
    <section className={`skeeTable ${settings.highContrast ? "highContrast" : ""}`}>
      <header className="realmTableHeader skeeHeader"><button type="button" aria-label="Pause match" onClick={openPause}>Ⅱ</button><span><CrownMark small /><b>REALM ROLL</b><small>{online ? "PRIVATE LANE · CONNECTED" : "FANTASY SKEE-BALL"}</small></span><button type="button" aria-label="Open shot history" onClick={openHistory}>☷</button></header>
      <PlayerScoreRail view={view} />
      <div className="frameRibbon"><span><small>{round}</small><b>{interactive ? "YOUR ROLL" : `${actor.name.toUpperCase()}'S ROLL`}</b></span><span className="ballPips">{Array.from({ length: BALLS_PER_ROUND }, (_, index) => <i key={index} className={index < usedThisRound ? "used" : index === usedThisRound ? "current" : ""}><RealmBall small /></i>)}</span><span><small>{ball}</small><b>{view.suddenDeath ? "TIEBREAKER" : `${remainingRealmBalls(actor)} LEFT`}</b></span></div>
      <SkeeLane selectedTarget={selectedTarget} choose={chooseTarget} lastShot={view.lastShot} rolling={phase === "rolling"} interactive={interactive && phase === "aim" && !busy} />
      <div className="shotConsole">
        {phase === "aim" && <><div className="aimSummary"><span><small>SELECTED REALM</small><b>{selectedTarget ? target.name : "Tap a scoring ring"}</b></span>{selectedTarget && <strong>{target.points}<i>PTS</i></strong>}</div><button className="skeeActionButton" type="button" onClick={beginPower} disabled={!interactive || !selectedTarget || busy}><span><b>LOCK TARGET</b><small>{selectedTarget ? `Aim for ${target.points} points` : "Choose a ring above"}</small></span><i>→</i></button></>}
        {phase === "power" && <><TimingMeter kind="power" idealPower={target.idealPower} /><button className="skeeActionButton power" type="button" onClick={lockPower} disabled={!interactive || busy}><span><b>LOCK POWER</b><small>Tap when the marker reaches gold</small></span><i>◆</i></button></>}
        {phase === "accuracy" && <><TimingMeter kind="accuracy" idealPower={target.idealPower} /><button className="skeeActionButton accuracy" type="button" onClick={shoot} disabled={!interactive || busy}><span><b>ROLL THE BALL</b><small>Tap when the marker reaches center</small></span><i>●</i></button></>}
        {phase === "rolling" && <div className="rollingStatus"><RealmBall /><span><b>ROLLING TO {target.name.toUpperCase()}</b><small>Power {Math.round(power * 100)} · Watch the lane</small></span></div>}
      </div>
    </section>
  );
}

function OutcomeModal({ outcome, close }: { outcome: ShotOutcome; close: () => void }) {
  const scored = outcome.shot.scoredTargetId ? getRealmTarget(outcome.shot.scoredTargetId) : null;
  const powerDifference = Math.abs(outcome.shot.power - outcome.target.idealPower);
  const accuracyDifference = Math.abs(outcome.shot.accuracy - .5);
  return (
    <div className={`skeeOutcome ${outcome.shot.points ? "scored" : "missed"}`} role="dialog" aria-modal="true" aria-label={`Shot scored ${outcome.shot.points} points`}>
      <section>
        <div className="outcomeLane"><MiniLane activeTarget={outcome.target.id} /><span className="outcomeBall"><RealmBall /></span></div>
        <p>{outcome.shot.perfect ? "PERFECT REALM ROLL" : outcome.shot.points ? "THE BALL FINDS A REALM" : "THE REALMS TURN IT AWAY"}</p>
        <h2>{outcome.shot.points ? `+${outcome.shot.points}` : "MISS"}</h2>
        <strong>{scored ? scored.name : "No scoring ring"}</strong>
        <span>{outcome.shot.points ? `${outcome.playerName} now holds ${outcome.playerScore} points.` : `${outcome.playerName} scores 0 this ball. The next roll can still change everything.`}</span>
        <div className="shotReadout"><i className={powerDifference <= .05 ? "good" : ""}><small>POWER</small><b>{Math.round(outcome.shot.power * 100)}</b></i><i className={accuracyDifference <= .05 ? "good" : ""}><small>ACCURACY</small><b>{Math.round((1 - Math.min(1, accuracyDifference * 2)) * 100)}%</b></i><i><small>TOTAL</small><b>{outcome.playerScore}</b></i></div>
        <button type="button" onClick={close}><span>{outcome.final ? "See final scores" : "End turn"}</span><i>→</i></button>
      </section>
    </div>
  );
}

function PassLane({ playerName, reveal }: { playerName: string; reveal: () => void }) {
  return <div className="passAtlas skeePass" role="dialog" aria-modal="true"><MiniLane activeTarget="river" /><p>PASS THE LANE TO</p><h2>{playerName}</h2><span>Tap below only when the next roller has the phone.</span><button className="realmPrimary" type="button" onClick={reveal}>I am ready to roll</button></div>;
}

function RulesModal({ close, tutorial }: { close: () => void; tutorial: () => void }) {
  return (
    <div className="realmModalScrim" role="dialog" aria-modal="true" aria-label="Realm Roll rules">
      <section className="realmRulesSheet skeeRulesSheet">
        <header><span><p>How to play</p><h2>Realm Roll</h2></span><button type="button" onClick={close} aria-label="Close rules">×</button></header>
        <div className="realmRulesBody">
          <blockquote>Realm Roll is fantasy Skee-Ball: choose a scoring ring, time the power, keep the ball straight, and finish with the highest score.</blockquote>
          <ol>
            <li><b>Aim</b><span>Tap one of the seven scoring rings. Center realms award 10–50; the two Dragon Gates award 100.</span></li>
            <li><b>Power</b><span>Lock the moving power marker inside your chosen realm&apos;s gold zone.</span></li>
            <li><b>Accuracy</b><span>Lock the second marker near center, then the ball rolls automatically.</span></li>
            <li><b>Score</b><span>The ring that catches the ball awards its printed points. A miss awards 0.</span></li>
            <li><b>Win</b><span>Every player rolls five balls in each of three rounds. The highest score after 15 balls wins.</span></li>
          </ol>
          <h3>The seven scoring realms</h3>
          <div className="targetGuide">{REALM_TARGETS.map((target) => <span key={target.id} style={{ "--target-hue": target.hue } as React.CSSProperties}><i>{target.points}</i><b>{target.name}</b><small>{target.points === 100 ? "Tiny, highest risk" : `Power zone ${Math.round(target.idealPower * 100)}`}</small></span>)}</div>
          <h3>Important details</h3>
          <ul><li>You never drag the ball; every control is a clear tap.</li><li>Near misses can land in a neighboring scoring ring.</li><li>Tied leaders enter Sudden Roll and receive one ball each until the tie breaks.</li><li>All scores and shot results are public information.</li></ul>
        </div>
        <button className="realmPrimary" type="button" onClick={tutorial}>Open the guided tutorial</button>
      </section>
    </div>
  );
}

function PauseModal({ resume, rules, leave }: { resume: () => void; rules: () => void; leave: () => void }) {
  return <div className="realmModalScrim" role="dialog" aria-modal="true"><section className="realmPauseSheet"><RealmBall /><p>MATCH PAUSED</p><h2>The lane is waiting.</h2><button className="realmPrimary" type="button" onClick={resume}>Return to the lane</button><button className="realmSecondary" type="button" onClick={rules}>Rules</button><button className="realmGhost" type="button" onClick={leave}>Save &amp; leave</button></section></div>;
}

function HistoryModal({ view, close }: { view: TableView; close: () => void }) {
  return (
    <div className="realmModalScrim" role="dialog" aria-modal="true"><section className="realmHistorySheet"><header><span><p>Shot history</p><h2>The lane remembers</h2></span><button type="button" onClick={close}>×</button></header><div>{view.events.length ? view.events.map((event) => <article key={event.id}><i className={event.kind}>●</i><span><b>Turn {event.turn}</b><p>{event.text}</p></span></article>) : <p className="emptyHistory">No ball has crossed the lane.</p>}</div></section></div>
  );
}

function FinishModal({ view, rematch, leave }: { view: TableView; rematch: () => void; leave: () => void }) {
  const winner = view.players.find((player) => view.winnerIds.includes(player.id)) ?? view.players[0];
  const rankings = [...view.players].sort((a, b) => b.score - a.score);
  return (
    <div className="realmFinish skeeFinish" role="dialog" aria-modal="true"><div className="finishSky" aria-hidden="true"><i /><i /><i /><i /></div><CrownMark /><p>THE LANE HAS A RULER</p><h2>{winner.name}</h2><span>claims the crown with {winner.score} points.</span><div className="finalScoreboard">{rankings.map((player, index) => <span key={player.id} className={index === 0 ? "winner" : ""}><i>{index + 1}</i><b>{player.name}</b><strong>{player.score}</strong></span>)}</div><button className="realmPrimary" type="button" onClick={rematch}>Roll another match</button><button className="realmGhost" type="button" onClick={leave}>Return to Realm Roll</button></div>
  );
}

function OnlineLobby({ invite, credentials, room, busy, error, create, join, leave, back }: {
  invite: PendingInvite | null; credentials: RealmOnlineCredentials | null; room: RealmRoomView | null; busy: boolean; error: string;
  create: (name: string) => void; join: (name: string, invitation?: string) => void; leave: () => void; back: () => void;
}) {
  const [name, setName] = useState("You");
  const [invitation, setInvitation] = useState("");
  const waiting = Boolean(credentials && room?.status === "waiting" && room.seat === 0);
  const share = async () => {
    if (!credentials?.inviteUrl) return;
    if (navigator.share) await navigator.share({ title: "Join my Realm Roll lane", text: "Play fantasy Skee-Ball with me.", url: credentials.inviteUrl });
    else await navigator.clipboard.writeText(credentials.inviteUrl);
  };
  if (waiting) return <Page eyebrow="Private lane" title="Waiting for your rival" back={leave}><div className="realmWaitingSeal skeeWaiting"><RealmBall /><strong>{room?.id}</strong><small>LANE CODE</small><i className="waitingOrbit" /></div><h2 className="realmLobbyTitle">Your invitation is ready.</h2><p className="realmLobbyCopy">Send the private link to your boyfriend. The match opens automatically when he takes the second lane.</p><button className="realmPrimary" type="button" onClick={() => void share()}>Share private invitation</button><p className="realmInviteLink">{credentials?.inviteUrl}</p>{error && <p className="realmOnlineError">{error}</p>}</Page>;
  if (invite) return <Page eyebrow="You were invited" title="Take the second lane" back={back}><div className="realmOnlineHero skeeOnlineHero"><span><RealmBall /></span><b>↗</b><span><RealmBall /></span></div><h2 className="realmLobbyTitle">Join lane {invite.roomId}</h2><p className="realmLobbyCopy">Choose the name your rival will see.</p><label className="realmOnlineName"><span>Your name</span><input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} /></label><button className="realmPrimary" type="button" disabled={busy} onClick={() => join(name)}>{busy ? "Taking your lane…" : "Join the match"}</button>{error && <p className="realmOnlineError">{error}</p>}</Page>;
  return <Page eyebrow="Two devices" title="Private lane" back={back}><div className="realmOnlineHero skeeOnlineHero"><span><RealmBall /></span><b>↗</b><span><RealmBall /></span></div><h2 className="realmLobbyTitle">Play from separate phones.</h2><p className="realmLobbyCopy">Create a private invitation or paste the link someone sent you. No account is required.</p><label className="realmOnlineName"><span>Your name</span><input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} /></label><button className="realmPrimary" type="button" disabled={busy} onClick={() => create(name)}>{busy ? "Opening the lane…" : "Create a private lane"}</button><div className="realmLobbyDivider"><i />OR<i /></div><label className="realmOnlineName"><span>Invitation link</span><input value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder="Paste the full Realm Roll link" /></label><button className="realmSecondary" type="button" disabled={busy || !invitation.trim()} onClick={() => join(name, invitation)}>Join from invitation</button>{error && <p className="realmOnlineError">{error}</p>}</Page>;
}

export default function RealmRollGame() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("title");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Chronicle>(DEFAULT_STATS);
  const [game, setGame] = useState<RealmGameState | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [phase, setPhase] = useState<ShotPhase>("aim");
  const [power, setPower] = useState(0);
  const [outcome, setOutcome] = useState<ShotOutcome | null>(null);
  const [privacyCurtain, setPrivacyCurtain] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState<Screen>("title");
  const [onlineCredentials, setOnlineCredentials] = useState<RealmOnlineCredentials | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<RealmRoomView | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const meterStarted = useRef(0);
  const outcomeTimer = useRef<number | null>(null);
  const recordedLocal = useRef<string | undefined>(undefined);
  const recordedOnline = useRef<string | undefined>(undefined);
  const seenOnlineGame = useRef<string | undefined>(undefined);
  const seenOnlineShot = useRef<string | undefined>(undefined);

  const currentView = onlineRoom?.game ?? game;

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const savedGame = upgradeRealmGameState(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
        const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<Settings> | null;
        const savedStats = JSON.parse(localStorage.getItem(STATS_KEY) || "null") as Partial<Chronicle> | null;
        const savedOnline = JSON.parse(localStorage.getItem(ONLINE_KEY) || "null") as RealmOnlineCredentials | null;
        if (savedGame) setGame(savedGame);
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedStats) setStats({ ...DEFAULT_STATS, ...savedStats });
        if (savedOnline?.roomId && savedOnline.token) setOnlineCredentials(savedOnline);
      } catch {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(ONLINE_KEY);
      }
      const query = new URLSearchParams(window.location.search);
      const roomId = query.get("realmRoom")?.trim().toUpperCase() ?? "";
      const token = query.get("realmKey")?.trim() ?? "";
      if (roomId && token) {
        setOnlineCredentials(null);
        setOnlineRoom(null);
        localStorage.removeItem(ONLINE_KEY);
        setPendingInvite({ roomId, token });
        setScreen("online");
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
    if (ready) localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [ready, stats]);

  useEffect(() => {
    if (!game || game.status !== "complete" || recordedLocal.current === game.id || stats.lastGameId === game.id) return;
    recordedLocal.current = game.id;
    const player = game.players[0];
    const timer = window.setTimeout(() => setStats((current) => current.lastGameId === game.id ? current : ({
      games: current.games + 1,
      wins: current.wins + (game.winnerIds.includes(player.id) ? 1 : 0),
      totalScore: current.totalScore + player.score,
      highScore: Math.max(current.highScore, player.score),
      perfectShots: current.perfectShots + player.shots.filter((shot) => shot.perfect).length,
      lastGameId: game.id,
    })), 0);
    return () => window.clearTimeout(timer);
  }, [game, stats.lastGameId]);

  useEffect(() => {
    const onlineGame = onlineRoom?.game;
    if (!onlineGame || onlineGame.status !== "complete" || recordedOnline.current === onlineGame.id || stats.lastGameId === onlineGame.id) return;
    recordedOnline.current = onlineGame.id;
    const player = onlineGame.players[onlineRoom.seat];
    const timer = window.setTimeout(() => setStats((current) => current.lastGameId === onlineGame.id ? current : ({
      games: current.games + 1,
      wins: current.wins + (onlineGame.winnerIds.includes(player.id) ? 1 : 0),
      totalScore: current.totalScore + player.score,
      highScore: Math.max(current.highScore, player.score),
      perfectShots: current.perfectShots + player.shots.filter((shot) => shot.perfect).length,
      lastGameId: onlineGame.id,
    })), 0);
    return () => window.clearTimeout(timer);
  }, [onlineRoom, stats.lastGameId]);

  useEffect(() => {
    if (!onlineCredentials || screen !== "online") return;
    let active = true;
    const credentials = onlineCredentials;
    const poll = async () => {
      try {
        const response = await fetch(`/api/realm-rooms/${credentials.roomId}`, { headers: { authorization: `Bearer ${credentials.token}` }, cache: "no-store" });
        const payload = await responseJson<{ room: RealmRoomView }>(response);
        if (active) setOnlineRoom(payload.room);
      } catch {
        // Keep the last synchronized lane visible during a quiet reconnect.
      }
    };
    void poll();
    const interval = window.setInterval(poll, 2100);
    return () => { active = false; window.clearInterval(interval); };
  }, [onlineCredentials, screen]);

  const revealOutcome = useCallback((view: TableView, shot: RealmShot, actorIndex: number) => {
    const player = view.players[actorIndex];
    setOutcome({ id: shot.id, playerName: player.name, playerScore: player.score, shot, target: getRealmTarget(shot.targetId), final: view.status === "complete" });
    setPhase("rolling");
    tone(settings.sound, shot.points ? "score" : "miss");
    haptic(settings.haptics, shot.points ? [16, 35, 24] : 14);
  }, [settings.haptics, settings.sound]);

  useEffect(() => {
    const onlineGame = onlineRoom?.game;
    if (!onlineGame) return;
    if (seenOnlineGame.current !== onlineGame.id) {
      seenOnlineGame.current = onlineGame.id;
      seenOnlineShot.current = onlineGame.lastShot?.id ?? "";
      return;
    }
    const shot = onlineGame.lastShot;
    if (!shot || seenOnlineShot.current === shot.id) return;
    seenOnlineShot.current = shot.id;
    const actorIndex = onlineGame.players.findIndex((player) => player.id === shot.playerId);
    const start = window.setTimeout(() => {
      setSelectedTarget(shot.targetId);
      setPhase("rolling");
      outcomeTimer.current = window.setTimeout(() => revealOutcome(onlineGame, shot, actorIndex), settings.reducedMotion ? 180 : 900);
    }, 0);
    return () => window.clearTimeout(start);
  }, [onlineRoom, revealOutcome, settings.reducedMotion]);

  const queueLocalOutcome = useCallback((next: RealmGameState, shot: RealmShot, actorIndex: number) => {
    setGame(next);
    setSelectedTarget(shot.targetId);
    setPhase("rolling");
    if (outcomeTimer.current) window.clearTimeout(outcomeTimer.current);
    outcomeTimer.current = window.setTimeout(() => revealOutcome(next, shot, actorIndex), settings.reducedMotion ? 180 : 900);
    tone(settings.sound, "roll");
    haptic(settings.haptics, [8, 18, 8]);
  }, [revealOutcome, settings.haptics, settings.reducedMotion, settings.sound]);

  useEffect(() => {
    if (!game || game.status !== "active" || screen !== "game" || phase !== "aim" || outcome || pauseOpen || privacyCurtain) return;
    const actor = game.players[game.currentPlayer];
    if (actor.kind !== "ai") return;
    const timer = window.setTimeout(() => {
      const action = chooseRealmAIShot(game);
      if (!action) return;
      const actorIndex = game.currentPlayer;
      const next = resolveRealmShot(game, action);
      if (next === game || !next.lastShot) return;
      queueLocalOutcome(next, next.lastShot, actorIndex);
    }, settings.reducedMotion ? 180 : 720);
    return () => window.clearTimeout(timer);
  }, [game, outcome, pauseOpen, phase, privacyCurtain, queueLocalOutcome, screen, settings.reducedMotion]);

  const beginGame = (next: RealmGameState) => {
    setGame(next); setSelectedTarget(""); setPhase("aim"); setPower(0); setOutcome(null); setPrivacyCurtain(next.mode === "local"); setScreen("game");
  };

  const startSolo = (difficulty: RealmDifficulty, bots: 1 | 2) => beginGame(createRealmGame([{ name: "You", kind: "human" }, ...AI_NAMES.slice(0, bots).map((name) => ({ name, kind: "ai" as const }))], { mode: "solo", difficulty }));
  const startLocal = (names: string[]) => beginGame(createRealmGame(names.map((name) => ({ name, kind: "human" as const })), { mode: "local", difficulty: "adept" }));

  const chooseTarget = (targetId: string) => {
    if (phase !== "aim") return;
    setSelectedTarget(targetId); tone(settings.sound, "tap"); haptic(settings.haptics, 8);
  };

  const meterValue = (period: number) => {
    const elapsed = Math.max(0, performance.now() - meterStarted.current);
    const progress = (elapsed % period) / period;
    return progress <= .5 ? progress * 2 : (1 - progress) * 2;
  };

  const beginPower = () => { if (!selectedTarget) return; meterStarted.current = performance.now(); setPhase("power"); tone(settings.sound, "lock"); };
  const lockPower = () => {
    const target = getRealmTarget(selectedTarget);
    setPower(settings.reducedMotion ? target.idealPower : meterValue(1400));
    meterStarted.current = performance.now(); setPhase("accuracy"); tone(settings.sound, "lock"); haptic(settings.haptics, 9);
  };

  const submitLocalShot = (accuracy: number) => {
    if (!game || !selectedTarget) return;
    const actorIndex = game.currentPlayer;
    const action: RealmShotAction = { actorId: game.players[actorIndex].id, targetId: selectedTarget, power, accuracy };
    const next = resolveRealmShot(game, action);
    if (next === game || !next.lastShot) return;
    queueLocalOutcome(next, next.lastShot, actorIndex);
  };

  const refreshOnline = async (credentials = onlineCredentials) => {
    if (!credentials) return;
    const response = await fetch(`/api/realm-rooms/${credentials.roomId}`, { headers: { authorization: `Bearer ${credentials.token}` }, cache: "no-store" });
    const payload = await responseJson<{ room: RealmRoomView }>(response);
    setOnlineRoom(payload.room);
  };

  const applyOnline = async (action: OnlineActionInput) => {
    if (!onlineCredentials || !onlineRoom) return;
    setOnlineBusy(true); setOnlineError("");
    try {
      const response = await fetch(`/api/realm-rooms/${onlineCredentials.roomId}/action`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${onlineCredentials.token}` }, body: JSON.stringify({ ...action, version: onlineRoom.version }) });
      const payload = await responseJson<{ room: RealmRoomView }>(response);
      setOnlineRoom(payload.room);
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "The roll could not be completed.");
      setPhase("accuracy");
      try { await refreshOnline(); } catch { /* polling will reconnect */ }
    } finally { setOnlineBusy(false); }
  };

  const shoot = () => {
    if (!selectedTarget) return;
    const accuracy = settings.reducedMotion ? .5 : meterValue(1160);
    setPhase("rolling");
    tone(settings.sound, "roll"); haptic(settings.haptics, [8, 18, 8]);
    if (screen === "online") void applyOnline({ type: "shoot", targetId: selectedTarget, power, accuracy });
    else submitLocalShot(accuracy);
  };

  const closeOutcome = () => {
    setOutcome(null); setSelectedTarget(""); setPower(0); setPhase("aim");
    if (game?.mode === "local" && game.status === "active") setPrivacyCurtain(true);
  };

  const createOnline = async (name: string) => {
    setOnlineBusy(true); setOnlineError("");
    try {
      const response = await fetch("/api/realm-rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await responseJson<{ room: RealmRoomView; credentials: RealmOnlineCredentials }>(response);
      setOnlineCredentials(payload.credentials); setOnlineRoom(payload.room); localStorage.setItem(ONLINE_KEY, JSON.stringify(payload.credentials));
    } catch (error) { setOnlineError(error instanceof Error ? error.message : "The lane could not be created."); }
    finally { setOnlineBusy(false); }
  };

  const joinOnline = async (name: string, invitation?: string) => {
    let invite = pendingInvite;
    if (invitation) {
      try {
        const url = new URL(invitation.trim());
        const roomId = url.searchParams.get("realmRoom")?.toUpperCase() ?? "";
        const token = url.searchParams.get("realmKey") ?? "";
        invite = roomId && token ? { roomId, token } : null;
      } catch { invite = null; }
    }
    if (!invite) { setOnlineError("Paste the full private invitation link."); return; }
    setOnlineBusy(true); setOnlineError("");
    try {
      const response = await fetch(`/api/realm-rooms/${invite.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: invite.token, name }) });
      const payload = await responseJson<{ room: RealmRoomView }>(response);
      const credentials = { roomId: invite.roomId, token: invite.token };
      setOnlineCredentials(credentials); setOnlineRoom(payload.room); setPendingInvite(null); localStorage.setItem(ONLINE_KEY, JSON.stringify(credentials)); window.history.replaceState({}, "", "/realm-roll");
    } catch (error) { setOnlineError(error instanceof Error ? error.message : "The second lane could not be claimed."); }
    finally { setOnlineBusy(false); }
  };

  const leaveOnline = () => { setOnlineCredentials(null); setOnlineRoom(null); setPendingInvite(null); setOnlineError(""); localStorage.removeItem(ONLINE_KEY); setScreen("title"); };
  const leaveLocal = () => { setGame(null); setOutcome(null); setPauseOpen(false); setScreen("title"); };
  const rematchLocal = () => { if (game) beginGame(createRealmGame(game.players.map((player) => ({ name: player.name, kind: player.kind })), { mode: game.mode, difficulty: game.difficulty })); };

  if (!ready) return <main className="realmApp realmLoading"><RealmBall /><p>Opening the lane…</p></main>;

  const localInteractive = Boolean(game && game.status === "active" && game.players[game.currentPlayer].kind === "human" && !outcome && phase !== "rolling" && !privacyCurtain);
  const onlineInteractive = Boolean(onlineRoom?.game && onlineRoom.game.status === "active" && onlineRoom.game.currentPlayer === onlineRoom.seat && !outcome && phase !== "rolling");

  return (
    <main className="realmApp skeeApp"><div className="realmNoise" aria-hidden="true" /><div className="realmShell skeeShell">
      {screen === "title" && <TitleScreen canContinue={Boolean(game?.status === "active" || onlineCredentials)} onContinue={() => onlineCredentials ? setScreen("online") : setScreen("game")} onPlay={() => setScreen("modes")} onRules={() => setRulesOpen(true)} onTutorial={() => setScreen("tutorial")} onChronicle={() => setScreen("chronicle")} onSettings={() => { setSettingsReturn("title"); setScreen("settings"); }} />}
      {screen === "modes" && <Modes back={() => setScreen("title")} solo={() => setScreen("solo")} online={() => { setOnlineError(""); setScreen("online"); }} local={() => setScreen("local")} />}
      {screen === "solo" && <SoloSetup back={() => setScreen("modes")} start={startSolo} />}
      {screen === "local" && <LocalSetup back={() => setScreen("modes")} start={startLocal} />}
      {screen === "tutorial" && <Tutorial back={() => setScreen("title")} practice={() => startSolo("novice", 1)} />}
      {screen === "chronicle" && <ChroniclePage stats={stats} back={() => setScreen("title")} />}
      {screen === "settings" && <SettingsPage settings={settings} setSettings={setSettings} back={() => setScreen(settingsReturn)} />}
      {screen === "online" && !onlineRoom?.game && <OnlineLobby invite={pendingInvite} credentials={onlineCredentials} room={onlineRoom} busy={onlineBusy} error={onlineError} create={createOnline} join={joinOnline} leave={leaveOnline} back={() => setScreen("modes")} />}
      {screen === "online" && onlineRoom?.game && <GameTable view={onlineRoom.game} seat={onlineRoom.seat} selectedTarget={selectedTarget} phase={phase} power={power} interactive={onlineInteractive} busy={onlineBusy} online settings={settings} chooseTarget={chooseTarget} beginPower={beginPower} lockPower={lockPower} shoot={shoot} openPause={() => setPauseOpen(true)} openHistory={() => setHistoryOpen(true)} />}
      {screen === "game" && game && <GameTable view={game} selectedTarget={selectedTarget} phase={phase} power={power} interactive={localInteractive} settings={settings} chooseTarget={chooseTarget} beginPower={beginPower} lockPower={lockPower} shoot={shoot} openPause={() => setPauseOpen(true)} openHistory={() => setHistoryOpen(true)} />}
      {screen === "game" && game?.mode === "local" && privacyCurtain && game.status === "active" && <PassLane playerName={game.players[game.currentPlayer].name} reveal={() => setPrivacyCurtain(false)} />}
      {outcome && <OutcomeModal outcome={outcome} close={closeOutcome} />}
      {screen === "game" && game?.status === "complete" && !outcome && phase !== "rolling" && <FinishModal view={game} rematch={rematchLocal} leave={leaveLocal} />}
      {screen === "online" && onlineRoom?.game?.status === "complete" && !outcome && phase !== "rolling" && <FinishModal view={onlineRoom.game} rematch={() => void applyOnline({ type: "rematch" })} leave={leaveOnline} />}
      {pauseOpen && <PauseModal resume={() => setPauseOpen(false)} rules={() => { setPauseOpen(false); setRulesOpen(true); }} leave={() => onlineRoom?.game ? leaveOnline() : leaveLocal()} />}
      {rulesOpen && <RulesModal close={() => setRulesOpen(false)} tutorial={() => { setRulesOpen(false); setScreen("tutorial"); }} />}
      {historyOpen && currentView && <HistoryModal view={currentView} close={() => setHistoryOpen(false)} />}
      {onlineError && onlineRoom?.game && <p className="realmOnlineToast">{onlineError}</p>}
    </div></main>
  );
}
