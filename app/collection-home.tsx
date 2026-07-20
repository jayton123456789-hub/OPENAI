"use client";

import { useEffect } from "react";
import Link from "next/link";

function MaskLifeMark() {
  return (
    <span className="collectionMark" aria-hidden="true">
      <i /><b /><em>✦</em>
    </span>
  );
}

export default function CollectionHome() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("room") && query.has("key")) {
      window.location.replace(`/veilbound${window.location.search}`);
    }
    if (query.has("realmRoom") && query.has("realmKey")) {
      window.location.replace(`/realm-roll${window.location.search}`);
    }
  }, []);

  return (
    <main className="collectionApp">
      <div className="collectionMist" aria-hidden="true"><i /><i /><i /><i /></div>
      <section className="collectionShell">
        <header className="collectionHeader">
          <MaskLifeMark />
          <span><b>MASKLIFE</b><small>Games for the spaces between messages</small></span>
          <i className="libraryCount">02</i>
        </header>

        <div className="collectionIntro">
          <p>THE NIGHT&apos;S LIBRARY</p>
          <h1>Choose your world.</h1>
          <span>Two complete games. One shared collection.</span>
        </div>

        <div className="gameLibrary">
          <Link className="libraryGame veilboundLibraryCard" href="/veilbound">
            <span className="libraryNumber">01</span>
            <span className="libraryArt veilboundLibraryArt" aria-hidden="true">
              <i className="miniMask"><b /><em /></i>
              <i className="libraryOrbit" />
            </span>
            <span className="libraryCopy">
              <small>Hidden identities · Cards · 2–4 players</small>
              <strong>Veilbound</strong>
              <em>Ask carefully, gather matching Echoes, and Bank seven Bounds before your rivals.</em>
              <b>Enter the Veil <i>→</i></b>
            </span>
          </Link>

          <Link className="libraryGame realmLibraryCard" href="/realm-roll">
            <span className="libraryNumber">02</span>
            <span className="libraryArt realmLibraryArt" aria-hidden="true">
              <i className="librarySkeeBall"><b>✦</b></i>
              <i className="librarySkeeLane"><b>10</b><b>30</b><b>50</b><b>100</b></i>
            </span>
            <span className="libraryCopy">
              <small>Fantasy Skee-Ball · Timing · 2–4 players</small>
              <strong>Realm Roll</strong>
              <em>Choose a scoring realm, time your power, and send the ball up a magical lane.</em>
              <b>Enter the Lane <i>→</i></b>
            </span>
          </Link>
        </div>

        <footer className="collectionFooter"><span>One life. Every character.</span><i>✦</i><span>Second game release</span></footer>
      </section>
    </main>
  );
}
