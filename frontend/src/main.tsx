import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowRight, BarChart3, Check, ChevronDown, CircleHelp,
  Copy, ExternalLink, Gauge, Link2, LockKeyhole, Menu, Radio,
  RefreshCw, Share2, Sparkles, Users, X, Zap, Maximize2, Download, QrCode,
  MonitorPlay, Trophy, Wifi, CheckCircle2
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./style.css";
import { API_URL, WS_URL, Poll, ResultCount, request, voterId, saveAuth, authToken, clearAuth } from "./api";

type Modal = "create" | "join" | "vote" | "results" | "auth" | "presenter" | null;

const DEMO_RESULTS = [
  { label: "React", pct: 42 },
  { label: "Go", pct: 28 },
  { label: "MongoDB", pct: 18 },
  { label: "Redis", pct: 12 },
];

function App() {
  const [modal, setModal] = useState<Modal>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [pollType, setPollType] = useState<"single"|"multiple">("single");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [finding, setFinding] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [voteError, setVoteError] = useState("");
  const [voting, setVoting] = useState(false);
  const [results, setResults] = useState<ResultCount[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(Boolean(authToken()));
  const [mobileNav, setMobileNav] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const closeAll = () => {
    setModal(null);
    setJoinError("");
    setVoteError("");
  };

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  useEffect(() => {
    if (!modal || modal === "vote" || modal === "results") return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeAll();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);

  const resetCreate = () => {
    setQuestion("");
    setOptions(["", "", "", ""]);
    setPollType("single");
  };

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken()) {
      setAuthMode("signin");
      setModal("auth");
      showToast("Sign in before creating a poll.");
      return;
    }
    const cleanQuestion = question.trim();
    const cleanOptions = options.map(v => v.trim()).filter(Boolean);

    if (cleanQuestion.length < 5) return showToast("Write a clearer poll question.");
    if (cleanOptions.length < 2) return showToast("Add at least two answer options.");
    if (new Set(cleanOptions.map(v => v.toLowerCase())).size !== cleanOptions.length)
      return showToast("Answer options must be unique.");

    setCreating(true);
    try {
      const data = await request<{poll: Poll}>("/api/polls", {
        method: "POST",
        body: JSON.stringify({
          question: cleanQuestion,
          type: pollType,
          options: cleanOptions,
        }),
      });
      setCreatedCode(data.poll.shareCode);
      setPoll(data.poll);
      setModal(null);
      resetCreate();
      showToast("Poll created successfully.");
    } catch (err: any) {
      showToast(err.message || "Could not create the poll.");
    } finally {
      setCreating(false);
    }
  }

  async function authenticate() {
    if (!authEmail.trim() || authPassword.length < 8) {
      showToast("Enter a valid email and an 8+ character password.");
      return;
    }
    setAuthBusy(true);
    try {
      const path = authMode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const data = await request<{ token: string; user: { id: string; email: string } }>(path, {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      saveAuth(data.token);
      setSignedIn(true);
      setModal(null);
      setAuthPassword("");
      showToast(authMode === "signin" ? "Signed in successfully." : "Account created successfully.");
    } catch (err: any) {
      showToast(err.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function findPoll() {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setJoinError("Enter the 6-character poll code.");
      return;
    }
    setFinding(true);
    setJoinError("");
    try {
      const data = await request<{poll: Poll}>(`/api/polls/${encodeURIComponent(code)}`);
      setPoll(data.poll);
      setSelected(null);
      setResults([]);
      try {
        const resultData = await request<{results: ResultCount[]}>(`/api/polls/${encodeURIComponent(code)}/results`);
        setResults(resultData.results || []);
      } catch {}
      setModal("vote");
    } catch (err: any) {
      setJoinError(err.message || "Poll not found. Check the code.");
    } finally {
      setFinding(false);
    }
  }

  function connectLive(p: Poll) {
    socketRef.current?.close();
    setLiveConnected(false);
    try {
      const ws = new WebSocket(`${WS_URL}/api/ws/${encodeURIComponent(p.id)}`);
      socketRef.current = ws;
      ws.onopen = () => setLiveConnected(true);
      ws.onclose = () => setLiveConnected(false);
      ws.onerror = () => setLiveConnected(false);
      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data?.results)) setResults(data.results);
          if (Array.isArray(data?.counts)) setResults(data.counts);
        } catch {}
      };
    } catch {
      setLiveConnected(false);
    }
  }

  async function submitVote() {
    if (!poll || !selected) return;
    if (localStorage.getItem(`pulsepoll_voted_${poll.id}`) === "true") {
      setVoteError("You have already voted in this poll.");
      setModal("results");
      return;
    }
    setVoting(true);
    setVoteError("");
    try {
      await request(`/api/polls/${encodeURIComponent(poll.shareCode)}/vote`, {
        method: "POST",
        headers: { "X-Voter-ID": voterId() },
        body: JSON.stringify({ optionId: selected }),
      });
      localStorage.setItem(`pulsepoll_voted_${poll.id}`, "true");
      connectLive(poll);
      setModal("results");
      showToast("Vote recorded.");
    } catch (err: any) {
      setVoteError(err.message || "Could not submit your vote.");
    } finally {
      setVoting(false);
    }
  }

  async function copy(text: string, message = "Copied to clipboard.") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(message);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      showToast("Copy failed. Please copy it manually.");
    }
  }

  const shareUrl = createdCode ? `${window.location.origin}/?poll=${createdCode}` : "";

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("poll");
    if (!code || !/^[A-Z0-9]{6}$/i.test(code)) return;
    setJoinCode(code.toUpperCase());
    request<{poll: Poll}>(`/api/polls/${encodeURIComponent(code.toUpperCase())}`)
      .then(async data => {
        setPoll(data.poll);
        try {
          const resultData = await request<{results: ResultCount[]}>(`/api/polls/${encodeURIComponent(code.toUpperCase())}/results`);
          setResults(resultData.results || []);
        } catch {}
        setModal("vote");
        connectLive(data.poll);
      })
      .catch(() => showToast("That poll link is no longer available."));
  }, []);

  function openJoin() {
    setJoinCode("");
    setJoinError("");
    setModal("join");
  }

  function openVote(p: Poll) {
    setPoll(p);
    setSelected(null);
    setVoteError("");
    setModal("vote");
    connectLive(p);
  }

  async function sharePoll(url = shareUrl, code = createdCode) {
    if (!url) return;
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my PulsePoll", text: `Join live poll ${code}`, url });
      } else {
        await copy(url, "Live poll link copied.");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") showToast("Sharing was not completed.");
    } finally {
      setSharing(false);
    }
  }

  function exportResults() {
    if (!poll) return;
    const rows = [["Poll", "Share Code", "Option", "Votes", "Percentage"]];
    computedResults.forEach(r => rows.push([poll.question, poll.shareCode, r.label, String(r.count), `${r.pct}%`]));
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulsepoll-${poll.shareCode}-results.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("CSV results exported.");
  }

  async function openPresenter() {
    if (!poll) return;
    setCreatedCode("");
    setPresenterOpen(true);
    setModal(null);
    connectLive(poll);
  }

  const computedResults = useMemo(() => {
    if (!poll) return [];
    const counts = poll.options.map(o => ({
      optionId: o.id,
      count: results.find(r => r.optionId === o.id)?.count ?? 0,
    }));
    const total = counts.reduce((s, r) => s + r.count, 0);
    return counts.map(r => ({
      ...r,
      pct: total ? Math.round((r.count / total) * 100) : 0,
      label: poll.options.find(o => o.id === r.optionId)?.text ?? "",
    }));
  }, [poll, results]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={() => setMobileNav(false)}>
          <span className="brand-mark"><Radio size={18}/></span>
          <span>PulsePoll</span>
        </a>
        <nav className={mobileNav ? "nav-links open" : "nav-links"}>
          <a href="#how" onClick={() => setMobileNav(false)}>How it works</a>
          <a href="#features" onClick={() => setMobileNav(false)}>Features</a>
          <a href="#analytics" onClick={() => setMobileNav(false)}>Live analytics</a>
        </nav>
        <div className="nav-actions">
          <button className="ghost-btn desktop-only" onClick={() => { if(signedIn){ clearAuth(); setSignedIn(false); showToast("Signed out."); } else {setAuthMode("signin");setModal("auth")} }}>{signedIn ? "Sign out" : "Sign in"}</button>
          <button className="outline-btn desktop-only" onClick={openJoin}>Join poll</button>
          <button className="primary-btn" onClick={() => setModal("create")}>Create poll <ArrowRight size={15}/></button>
          <button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Menu"><Menu size={20}/></button>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="eyebrow"><span className="pulse-dot"/><span>REAL-TIME AUDIENCE ENGAGEMENT</span></div>
          <h1>Ask better questions.<br/><span>See the room respond.</span></h1>
          <p className="hero-copy">
            Create a live poll, share one short code, and watch every response appear instantly.
            Built for presentations, classrooms, events, teams and demos.
          </p>
          <div className="hero-actions">
            <button className="primary-btn large" onClick={() => setModal("create")}>Create a live poll <ArrowRight size={17}/></button>
            <button className="outline-btn large" onClick={openJoin}>Join with a code</button>
          </div>
          <div className="trust-row">
            <span><Check size={14}/> No app required</span>
            <span><Check size={14}/> Live WebSocket updates</span>
            <span><Check size={14}/> Mobile ready</span>
          </div>

          <div className="hero-product">
            <div className="product-window">
              <div className="window-bar">
                <div className="window-dots"><i/><i/><i/></div>
                <div className="window-url"><LockKeyhole size={11}/> pulsepoll.app / live</div>
                <div className="live-pill"><span/> LIVE</div>
              </div>
              <div className="product-body">
                <div className="product-sidebar">
                  <div className="mini-brand"><span className="brand-mark small"><Radio size={13}/></span> PulsePoll</div>
                  <div className="side-active"><Gauge size={15}/> Overview</div>
                  <div className="side-item"><BarChart3 size={15}/> Analytics</div>
                  <div className="side-item"><Users size={15}/> Audience</div>
                  <div className="side-item"><CircleHelp size={15}/> Help</div>
                </div>
                <div className="product-main">
                  <div className="product-heading">
                    <div><span className="tiny-label">LIVE SESSION</span><h3>Which technology should we learn next?</h3></div>
                    <div className="session-code">E1A298 <Copy size={13}/></div>
                  </div>
                  <div className="metric-row">
                    <div className="metric"><span>Responses</span><strong>248</strong><small><Activity size={11}/> Updating now</small></div>
                    <div className="metric"><span>Participation</span><strong>82%</strong><small><Zap size={11}/> Strong engagement</small></div>
                    <div className="metric"><span>Live status</span><strong className="green">Active</strong><small><span className="mini-pulse"/> WebSocket connected</small></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-head"><span>Response distribution</span><span className="muted">Live</span></div>
                    {DEMO_RESULTS.map((r, i) => (
                      <div className="demo-result" key={r.label}>
                        <div><span>{r.label}</span><b>{r.pct}%</b></div>
                        <div className="track"><div className={`fill f${i}`} style={{width:`${r.pct}%`}}/></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-heading center">
            <span className="tiny-label">BUILT FOR LIVE MOMENTS</span>
            <h2>Everything you need to run a polished poll.</h2>
            <p>Keep the audience focused on the question while PulsePoll handles the live response flow.</p>
          </div>
          <div className="feature-grid">
            {[
              [<Radio/>, "Real-time results", "Responses stream through the live connection without page refreshes."],
              [<Share2/>, "One-code sharing", "Give participants a short code or share link that works on any device."],
              [<BarChart3/>, "Clear analytics", "Turn raw votes into readable percentages, bars and totals instantly."],
              [<LockKeyhole/>, "Safer creation", "Creator controls can be protected behind the backend authentication layer."],
              [<Gauge/>, "Fast interactions", "Focused voting screens reduce friction when an audience is answering together."],
              [<Sparkles/>, "Presentation-ready", "A clean visual system makes the product feel like a real SaaS tool."],
            ].map(([icon,title,desc]) => (
              <div className="feature-card" key={String(title)}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section split" id="how">
          <div>
            <span className="tiny-label">THE CORE FLOW</span>
            <h2>From question to live insight in seconds.</h2>
            <p className="section-copy">The product is intentionally simple: a creator starts a poll, the audience joins with a code, and the result surface stays connected to the live vote stream.</p>
            <div className="steps">
              {[
                ["01","Create","Write a question and add the answer options."],
                ["02","Share","Send the six-character code or live link."],
                ["03","Vote","Participants choose an answer from any browser."],
                ["04","Watch","Results update live as votes arrive."],
              ].map(([n,t,d]) => <div className="step" key={n}><b>{n}</b><div><strong>{t}</strong><p>{d}</p></div></div>)}
            </div>
          </div>
          <div className="phone-stage">
            <div className="phone">
              <div className="phone-top"><span/><span>9:41</span><span>•••</span></div>
              <div className="phone-brand"><span className="brand-mark small"><Radio size={13}/></span> PulsePoll <span className="live-pill tiny"><span/> LIVE</span></div>
              <div className="phone-code">E1A298</div>
              <div className="phone-question">What should our team build next?</div>
              {["AI assistant","Mobile app","Analytics"].map((x,i)=><div className={`phone-option ${i===0?"selected":""}`} key={x}><span>{i+1}</span>{x}{i===0&&<Check size={15}/>}</div>)}
              <button className="phone-submit">Submit response</button>
            </div>
          </div>
        </section>

        <section className="section analytics-section" id="analytics">
          <div className="section-heading center">
            <span className="tiny-label">LIVE ANALYTICS</span>
            <h2>Results that make the response visible.</h2>
            <p>Bars, percentages and totals update as your backend broadcasts the vote event.</p>
          </div>
          <div className="analytics-demo">
            <div className="analytics-top">
              <div><span className="live-pill"><span/> LIVE</span><h3>Which technology should we learn next?</h3></div>
              <div className="analytics-total"><strong>248</strong><span>responses</span></div>
            </div>
            <div className="big-results">
              {DEMO_RESULTS.map((r,i)=><div className="big-result" key={r.label}><div><span>{r.label}</span><strong>{r.pct}%</strong></div><div className="track big"><div className={`fill f${i}`} style={{width:`${r.pct}%`}}/></div></div>)}
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div>
            <span className="tiny-label">READY WHEN YOU ARE</span>
            <h2>Turn your next presentation into a live conversation.</h2>
            <p>Build the poll. Share the code. Watch the room respond.</p>
          </div>
          <div className="cta-actions"><button className="primary-btn large" onClick={() => setModal("create")}>Create poll <ArrowRight size={17}/></button><button className="outline-btn large" onClick={openJoin}>Join poll</button></div>
        </section>
      </main>

      <footer><span>© 2026 PulsePoll</span><span>Real-time opinions. One pulse.</span><span>Built with React · Go · MongoDB · Redis</span></footer>

      {modal && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && closeAll()}>
        {modal === "create" && (
          <div className="modal-card create-card">
            <button className="close-btn" onClick={closeAll}><X size={18}/></button>
            <div className="modal-head"><div className="modal-icon"><Sparkles size={20}/></div><div><span className="tiny-label">NEW POLL</span><h2>Create a live poll</h2><p>Build a focused question for your audience.</p></div></div>
            <form onSubmit={createPoll}>
              <label>Question<input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={200} placeholder="What do you want to ask?" autoFocus/><small>{question.length}/200</small></label>
              <label>Answer options</label>
              <div className="option-list">{options.map((v,i)=><div className="input-row" key={i}><span>{i+1}</span><input value={v} onChange={e=>setOptions(o=>o.map((x,j)=>j===i?e.target.value:x))} maxLength={100} placeholder={i<2?`Option ${i+1}`:`Option ${i+1} (optional)`} required={i<2}/></div>)}</div>
              <div className="type-row"><div><strong>Voting mode</strong><small>Single choice is fully supported by the current API.</small></div><select value={pollType} onChange={e=>setPollType(e.target.value as any)}><option value="single">Single choice</option><option value="multiple" disabled>Multiple choice — backend update required</option></select></div>
              <button className="primary-btn submit-btn" disabled={creating}>{creating?<><RefreshCw className="spin" size={16}/> Creating...</>:<>Create poll <ArrowRight size={16}/></>}</button>
            </form>
          </div>
        )}

        {modal === "join" && (
          <div className="modal-card join-card">
            <button className="close-btn" onClick={closeAll}><X size={18}/></button>
            <div className="join-icon"><Link2 size={21}/></div>
            <span className="tiny-label">PARTICIPANT</span><h2>Join a live poll</h2><p>Enter the six-character code shown by your presenter.</p>
            <input className="code-input" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6))} onKeyDown={e=>e.key==="Enter"&&findPoll()} placeholder="E1A298" autoFocus/>
            {joinError && <div className="error-box">{joinError}</div>}
            <button className="primary-btn submit-btn" onClick={findPoll} disabled={finding}>{finding?<><RefreshCw className="spin" size={16}/> Finding poll...</>:<>Continue <ArrowRight size={16}/></>}</button>
            <small className="modal-note">No participant account is required.</small>
          </div>
        )}

        {modal === "vote" && poll && (
          <div className="modal-card vote-card">
            <button className="close-btn" onClick={()=>{closeAll();socketRef.current?.close()}}><X size={18}/></button>
            <div className="vote-bar"><span className="live-pill"><span/> LIVE</span><span>{poll.shareCode}</span></div>
            <div className="vote-inner"><span className="tiny-label">YOUR RESPONSE</span><h2>{poll.question}</h2><p className="muted">{poll.type==="multiple"?"Select your options.":"Select one option to continue."}</p>
              <div className="vote-options">{poll.options.map((o,i)=><button className={`vote-choice ${selected===o.id?"selected":""}`} key={o.id} onClick={()=>setSelected(o.id)}><span>{i+1}</span><strong>{o.text}</strong>{selected===o.id&&<span className="check"><Check size={15}/></span>}</button>)}</div>
              {voteError && <div className="error-box">{voteError}</div>}
              <button className="primary-btn submit-btn" onClick={submitVote} disabled={!selected||voting}>{voting?<><RefreshCw className="spin" size={16}/> Recording...</>:<>Submit response <ArrowRight size={16}/></>}</button>
              <div className="connection"><span className={liveConnected?"connected-dot":"offline-dot"}/>{liveConnected?"Live connection active":"Connecting to live results..."}</div>
            </div>
          </div>
        )}

        {modal === "results" && poll && (
          <div className="modal-card results-card">
            <button className="close-btn" onClick={()=>{closeAll();socketRef.current?.close()}}><X size={18}/></button>
            <div className="vote-bar"><span className="live-pill"><span/> LIVE RESULTS</span><span>{poll.shareCode}</span></div>
            <div className="results-inner"><span className="tiny-label">RESPONSE SUMMARY</span><h2>{poll.question}</h2><p className="muted">Your response is recorded. Results continue updating live.</p>
              <div className="result-list">
                {(computedResults.length?computedResults:poll.options.map(o=>({optionId:o.id,label:o.text,count:0,pct:0}))).map((r,i)=><div className="result-item" key={r.optionId}><div><span>{r.label}</span><strong>{r.pct}%</strong></div><div className="track"><div className={`fill f${i%4}`} style={{width:`${r.pct}%`}}/></div><small>{r.count} {r.count===1?"response":"responses"}</small></div>)}
              </div>
              <div className="result-footer"><span><Users size={14}/> {computedResults.reduce((s,r)=>s+r.count,0)} total responses</span><span className={liveConnected?"green":""}><span className={liveConnected?"mini-pulse":"offline-dot"}/> {liveConnected?"Updating live":"Live connection unavailable"}</span></div>
              <div className="result-actions"><button className="outline-btn" onClick={exportResults}><Download size={14}/> Export CSV</button><button className="primary-btn" onClick={openPresenter}><MonitorPlay size={14}/> Presenter view</button></div><button className="outline-btn full" onClick={()=>{closeAll();socketRef.current?.close()}}>Close results</button>
            </div>
          </div>
        )}

        {modal === "auth" && (
          <div className="modal-card auth-card">
            <button className="close-btn" onClick={closeAll}><X size={18}/></button>
            <div className="join-icon"><LockKeyhole size={21}/></div>
            <span className="tiny-label">{authMode==="signin"?"CREATOR ACCESS":"CREATE ACCOUNT"}</span>
            <h2>{authMode==="signin"?"Welcome back":"Create your creator account"}</h2>
            <p>{authMode==="signin"?"Sign in to create and manage live polls.":"Create a secure creator account in seconds."}</p>
            <label>Email<input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com" autoFocus/></label>
            <label>Password<input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&authenticate()} placeholder="At least 8 characters"/></label>
            <button className="primary-btn submit-btn" onClick={authenticate} disabled={authBusy}>{authBusy?<><RefreshCw className="spin" size={16}/> Working...</>:<>{authMode==="signin"?"Sign in":"Create account"} <ArrowRight size={16}/></>}</button>
            <button className="text-btn" onClick={()=>setAuthMode(authMode==="signin"?"signup":"signin")}>{authMode==="signin"?"Need an account? Sign up":"Already have an account? Sign in"}</button>
          </div>
        )}
      </div>}

      {createdCode && <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setCreatedCode("")}>
        <div className="success-card">
          <button className="close-btn" onClick={()=>setCreatedCode("")}><X size={18}/></button>
          <div className="success-mark"><Check size={26}/></div>
          <span className="tiny-label green">POLL LIVE</span>
          <h2>Your poll is ready.</h2>
          <p>Share the code or link with your audience.</p>
          <div className="share-code-box"><span>{createdCode}</span><button onClick={()=>copy(createdCode)}><Copy size={15}/> {copied?"Copied":"Copy"}</button></div>
          <div className="share-link"><span><Link2 size={14}/>{shareUrl}</span><button onClick={()=>copy(shareUrl,"Live poll link copied.")}><Copy size={14}/></button></div>
          <div className="success-actions"><button className="outline-btn" onClick={()=>{setCreatedCode(""); if(poll) openVote(poll)}}>Open poll</button><button className="primary-btn" onClick={()=>sharePoll()} disabled={sharing}><Share2 size={15}/> {sharing?"Sharing...":"Share"}</button></div>
          <div className="success-actions secondary-actions"><button className="outline-btn" onClick={()=>poll&&openPresenter()}><MonitorPlay size={15}/> Presenter view</button><button className="outline-btn" onClick={()=>copy(shareUrl,"Join link copied.")}><Copy size={15}/> Copy link</button></div>
          <div className="qr-panel">
            <div className="qr-copy"><span className="tiny-label">SCAN TO JOIN</span><strong>{createdCode}</strong><p>Participants can scan this code to open the poll instantly.</p></div>
            <div className="qr-frame"><QRCodeSVG value={shareUrl} size={118} bgColor="#ffffff" fgColor="#080a0f" includeMargin /></div>
          </div>
          <small>Presenter view keeps the live results visible while votes arrive.</small>
        </div>
      </div>}

      {presenterOpen && poll && (
        <div className="presenter-shell">
          <div className="presenter-topbar">
            <div className="presenter-brand"><span className="brand-mark small"><Radio size={13}/></span><span>PulsePoll</span><span className="live-pill"><span/> LIVE</span></div>
            <div className="presenter-actions">
              <button className="presenter-btn" onClick={exportResults}><Download size={15}/> Export CSV</button>
              <button className="presenter-btn" onClick={()=>sharePoll(`${window.location.origin}/?poll=${poll.shareCode}`, poll.shareCode)}><Share2 size={15}/> Share</button>
              <button className="presenter-btn" onClick={()=>document.documentElement.requestFullscreen?.()}><Maximize2 size={15}/> Fullscreen</button>
              <button className="presenter-close" onClick={()=>{setPresenterOpen(false);socketRef.current?.close()}}><X size={18}/></button>
            </div>
          </div>
          <div className="presenter-content">
            <div className="presenter-heading">
              <div><span className="tiny-label">LIVE SESSION · {poll.shareCode}</span><h1>{poll.question}</h1></div>
              <div className="presenter-live"><Wifi size={16}/><span>{liveConnected ? "Live connection" : "Reconnecting"}</span></div>
            </div>
            <div className="presenter-grid">
              <section className="presenter-results">
                <div className="presenter-card-head"><span>Response distribution</span><span>{computedResults.reduce((s,r)=>s+r.count,0)} responses</span></div>
                {computedResults.map((r,i)=>(
                  <div className="presenter-result" key={r.optionId}>
                    <div className="presenter-result-label"><span><b>{String.fromCharCode(65+i)}</b>{r.label}</span><strong>{r.pct}%</strong></div>
                    <div className="presenter-track"><div className={`fill f${i%4}`} style={{width:`${r.pct}%`}}/></div>
                    <small>{r.count} {r.count===1?"response":"responses"}</small>
                  </div>
                ))}
                <div className="presenter-status"><CheckCircle2 size={16}/><span>Results update automatically as new votes arrive.</span></div>
              </section>
              <aside className="presenter-side">
                <div className="presenter-side-card join-presenter-card">
                  <span className="tiny-label">JOIN WITH YOUR PHONE</span>
                  <div className="presenter-code">{poll.shareCode}</div>
                  <div className="presenter-qr"><QRCodeSVG value={`${window.location.origin}/?poll=${poll.shareCode}`} size={170} bgColor="#ffffff" fgColor="#080a0f" includeMargin /></div>
                  <p>Scan the QR code or enter the six-character code.</p>
                </div>
                <div className="presenter-side-card stat-presenter-card"><span>Responses</span><strong>{computedResults.reduce((s,r)=>s+r.count,0)}</strong><small><span className="mini-pulse"/> Updating live</small></div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><Check size={15}/>{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
