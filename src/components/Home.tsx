import React from "react";
import { Zap, Shield, Clock, Dice5, ArrowRight, Blocks } from "lucide-react";
import DemoWidget from "./DemoWidget";

export default function Home({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="home">
      {/* hero */}
      <section className="hero hero-2col">
        <div className="hero-left">
          <h1>Bet on the<br /><span className="grad">next block.</span></h1>
          <p className="hero-sub">
            Every outcome is decided by a future LiteForge block, its hash, its transactions, its gas.
            Nobody can predict it. Nobody can fake it. You can verify every single result on-chain.
          </p>
          <button className="enter-btn" onClick={onEnter}>
            Enter Betting Zone <ArrowRight size={18} />
          </button>
          <div className="hero-stats">
            <div><b>0.01</b><span>zkLTC per bet</span></div>
            <div><b>~0.2s</b><span>block time</span></div>
            <div><b>7</b><span>game modes</span></div>
            <div><b>100%</b><span>verifiable</span></div>
          </div>
        </div>
        <div className="hero-right">
          <img
            src="https://raw.githubusercontent.com/dopedopex/your-friendly-helper/main/boblogo.jpg"
            alt="BetsOnBlock"
            className="hero-logo-img"
          />
        </div>
      </section>

      {/* how it works */}
      <section className="how">
        <h2 className="sec-h">How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <Clock size={22} />
            <h3>A round opens</h3>
            <p>Two rounds run at once, 5 minutes apart. Pick the one you like and place your bets while it's open.</p>
          </div>
          <div className="step">
            <div className="num">2</div>
            <Dice5 size={22} />
            <h3>Choose your bet</h3>
            <p>Coin flip, hi-lo, lucky digit, number 0-99, transaction over/under, gas, or the PvP "closest" pool. Stack as many as you like, each is a flat 0.01 zkLTC.</p>
          </div>
          <div className="step">
            <div className="num">3</div>
            <Shield size={22} />
            <h3>Betting locks</h3>
            <p>30 seconds before settle, betting closes. The target block hasn't been mined yet, so the outcome is impossible to know or game.</p>
          </div>
          <div className="step">
            <div className="num">4</div>
            <Blocks size={22} />
            <h3>The block decides</h3>
            <p>When the block lands, its hash and data resolve every bet instantly. Winners are paid from the house wallet. Check the result on the explorer.</p>
          </div>
        </div>
      </section>

      {/* derivation explainer */}
      <section className="how">
        <h2 className="sec-h">Where the result comes from</h2>
        <p className="sec-sub">A block hash like <span className="mono hl">0xd7fb…2de4c</span> is just a giant random number. We read simple, public facts from it:</p>
        <div className="derive">
          <div className="d"><b>Even / Odd</b><span>hash mod 2 → Coin Flip</span></div>
          <div className="d"><b>Last digit</b><span>0-f → Lucky Digit & Hi-Lo</span></div>
          <div className="d"><b>mod 100</b><span>0-99 → Number game</span></div>
          <div className="d"><b>mod 1000</b><span>0-999 → Closest (PvP)</span></div>
          <div className="d"><b>Tx count</b><span>→ Over / Under</span></div>
          <div className="d"><b>Gas used</b><span>→ Over / Under</span></div>
        </div>
      </section>

      {/* live demo */}
      <section className="how">
        <h2 className="sec-h">See it on a real past block</h2>
        <p className="sec-sub">Here's an already-settled block. Watch how a Coin Flip bet would have resolved, straight from the hash.</p>
        <DemoWidget />
      </section>

      <section className="cta-end">
        <h2>Ready to play?</h2>
        <p>Connect your wallet, stake 0.01 zkLTC, and let the chain decide.</p>
        <button className="enter-btn" onClick={onEnter}>Enter Betting Zone <ArrowRight size={18} /></button>
      </section>
    </div>
  );
}
