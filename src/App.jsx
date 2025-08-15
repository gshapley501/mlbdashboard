
import React, { useEffect, useMemo, useRef, useState } from "react";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const CURRENT_SEASON =
  new Date().getMonth() < 2
    ? new Date().getFullYear() - 1
    : new Date().getFullYear();

// Map MLB team IDs to official MLB.com team URLs
const TEAM_URLS = {
  108: "https://www.mlb.com/angels",
  109: "https://www.mlb.com/dbacks",
  110: "https://www.mlb.com/orioles",
  111: "https://www.mlb.com/redsox",
  112: "https://www.mlb.com/cubs",
  113: "https://www.mlb.com/reds",
  114: "https://www.mlb.com/guardians",
  115: "https://www.mlb.com/rockies",
  116: "https://www.mlb.com/tigers",
  117: "https://www.mlb.com/astros",
  118: "https://www.mlb.com/royals",
  119: "https://www.mlb.com/dodgers",
  120: "https://www.mlb.com/nationals",
  121: "https://www.mlb.com/mets",
  133: "https://www.mlb.com/athletics",
  134: "https://www.mlb.com/pirates",
  135: "https://www.mlb.com/padres",
  136: "https://www.mlb.com/mariners",
  137: "https://www.mlb.com/giants",
  138: "https://www.mlb.com/cardinals",
  139: "https://www.mlb.com/rays",
  140: "https://www.mlb.com/rangers",
  141: "https://www.mlb.com/bluejays",
  142: "https://www.mlb.com/twins",
  143: "https://www.mlb.com/phillies",
  144: "https://www.mlb.com/braves",
  145: "https://www.mlb.com/whitesox",
  146: "https://www.mlb.com/marlins",
  147: "https://www.mlb.com/yankees",
  158: "https://www.mlb.com/brewers",
};

// ----- utils -----
const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, delta) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + delta);
  return fmtDate(d);
};
const prettyTime = (
  isoString,
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone
) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
};

// ---- Shared helpers/components ----

// Small, inline‑styled logo (works without Tailwind)
function TeamLogo({ id, abbr, size = 28 }) {
  const candidates = [
    `https://www.mlbstatic.com/team-logos/${id}.svg`,
    `https://www.mlbstatic.com/team-logos/team-${id}.svg`,
  ];
  const [idx, setIdx] = useState(0);
  const url = candidates[idx];
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
  };
  if (!id || idx >= candidates.length)
    return <div style={box}>{abbr?.slice(0, 3)}</div>;
  return (
    <img
      src={url}
      alt="logo"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
      }}
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1);
        else setIdx(candidates.length);
      }}
      onLoad={(e) => {
        if (!e.currentTarget.naturalWidth && idx < candidates.length - 1)
          setIdx(idx + 1);
      }}
    />
  );
}

function RoleTag({ role }) {
  const isHome = role === "home";
  const text = isHome ? "HOME" : "AWAY";
  const icon = isHome ? "🏠" : "🚌";
  const cls = isHome ? "role role-home" : "role role-away";
  return (
    <span className={cls}>
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {text}
    </span>
  );
}

// Parse clinch flags from MLB StatsAPI teamRecord (shared by Standings & Playoffs)
function parseClinchFlags(tr) {
  // One-letter codes sometimes appear: x=postseason berth, y=division, z=best league record/homefield, w=wild card
  const ci = String(tr?.clinchIndicator || "").toLowerCase();

  const divisionClinched =
    !!(tr?.divisionChamp || tr?.clinchedDivision) || ci === "y" || ci === "z";

  const playoffClinched =
    !!(tr?.clinched || tr?.clinchedPostseason || tr?.clinchedWildCard) ||
    ci === "x" ||
    ci === "y" ||
    ci === "z" ||
    ci === "w";

  return { divisionClinched, playoffClinched, clinchIndicator: ci };
}

// Tiny legend for badges
function BadgesLegend() {
  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 6px",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    fontSize: 12,
    background: "#fff",
  };
  return (
    <div
      className="legend"
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginTop: 4,
      }}
    >
      <span style={{ color: "#64748b", fontSize: 12 }}>Legend:</span>
      <span className="pill pill-mini" style={chip}>
        DIV 🏆
      </span>
      <span style={{ fontSize: 12, color: "#64748b" }}>Clinched division</span>
      <span className="pill pill-mini" style={chip}>
        WC 🎟️
      </span>
      <span style={{ fontSize: 12, color: "#64748b" }}>Clinched wild card</span>
    </div>
  );
}

// Team row with score pill aligned to the right
function TeamRowWithScore({ team, role, leading }) {
  return (
    <div className="teamline">
      <div className="teamline-left">
        <TeamLogo id={team.id} abbr={team.abbr} />
        <div className="teamline-meta">
          <div className="team-name" title={team.name}>
            <a
              href={TEAM_URLS[team.id] || "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {team.name}
            </a>
          </div>
          <div className="team-sub-row">
            {team.record && <div className="team-sub">{team.record}</div>}
            <RoleTag role={role} />
          </div>
        </div>
      </div>
      <div className={"scorepill" + (leading ? " scorepill-leading" : "")}>
        {team.score ?? "-"}
      </div>
    </div>
  );
}

function StatusPill({ text }) {
  const t = (text || "").toLowerCase();
  let bg = "#e2e8f0",
    fg = "#0f172a",
    bd = "#e2e8f0";
  if (t.includes("final")) {
    bg = "#ecfdf5";
    fg = "#065f46";
    bd = "#a7f3d0";
  }
  if (t.includes("in progress") || t.includes("delayed")) {
    bg = "#fffbeb";
    fg = "#92400e";
    bd = "#fde68a";
  }
  if (t.includes("postponed") || t.includes("suspended")) {
    bg = "#fef2f2";
    fg = "#991b1b";
    bd = "#fecaca";
  }
  return (
    <span className="pill" style={{ background: bg, borderColor: bd, color: fg }}>
      {text}
    </span>
  );
}

function statusWithInning(game) {
  const base = (game?.status || "").trim();
  const inn = game?.linescore?.currentInning;
  const half = game?.linescore?.isTopInning;
  if (game?.isLive && inn) {
    return `${base} – ${half ? "Top" : "Bot"} ${inn}`;
  }
  return base;
}

function extrasBadge(game) {
  const isFinal = /final/i.test(game?.status || "");
  const inn = game?.linescore?.currentInning;
  if (isFinal && typeof inn === "number" && inn > 9) {
    return <span className="pill pill-mini">F/{inn}</span>;
  }
  return null;
}

function simplifyGame(game) {
  const ls = game?.linescore || {};
  const home = game?.teams?.home;
  const away = game?.teams?.away;
  const homeTeam = home?.team;
  const awayTeam = away?.team;
  const homeRuns = home?.score ?? ls?.teams?.home?.runs ?? null;
  const awayRuns = away?.score ?? ls?.teams?.away?.runs ?? null;
  return {
    id: game.gamePk,
    gameDate: game.gameDate,
    status: game?.status?.detailedState || game?.status?.abstractGameState,
    venue: game?.venue?.name,
    doubleHeader: game?.doubleHeader,
    seriesGameNumber: game?.seriesGameNumber,
    linescore: {
      currentInning: ls?.currentInning,
      isTopInning: ls?.isTopInning,
    },
    away: {
      id: awayTeam?.id,
      name: awayTeam?.name,
      // Avoid mixing ?? and || without parentheses
      abbr: (awayTeam?.abbreviation ?? (awayTeam?.teamName ?? "Away")),
      record: away?.leagueRecord
        ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}`
        : "",
      score: awayRuns,
    },
    home: {
      id: homeTeam?.id,
      name: homeTeam?.name,
      abbr: (homeTeam?.abbreviation ?? (homeTeam?.teamName ?? "Home")),
      record: home?.leagueRecord
        ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}`
        : "",
      score: homeRuns,
    },
    isFinal: /final/i.test(game?.status?.detailedState || ""),
    isLive: /in progress|delayed|warmup/i.test(
      game?.status?.detailedState || ""
    ),
  };
}

// ---- LIVE Scores Panel ----
function ScoresPanel({ date, setDate, tz }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const abortRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") setDate((d) => addDays(d, -1));
      if (e.key === "ArrowRight") setDate((d) => addDays(d, 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDate]);

  async function fetchScores(forDate) {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const url = `${MLB_API}/schedule?sportId=1&date=${forDate}&language=en&hydrate=linescore,team,flags`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Network ${res.status}`);
      const data = await res.json();
      const g = (data?.dates?.[0]?.games || []).map(simplifyGame);
      setGames(g);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "Failed to load scores");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchScores(date);
  }, [date]);

  const filtered = useMemo(() => {
    if (filter === "final") return games.filter((g) => g.isFinal);
    if (filter === "live") return games.filter((g) => g.isLive);
    if (filter === "upcoming") return games.filter((g) => !g.isFinal && !g.isLive);
    return games;
  }, [games, filter]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="controls">
        <button className="btn" onClick={() => setDate(addDays(date, -1))}>
          ← Prev
        </button>
        <div className="row">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn" onClick={() => setDate(fmtDate(new Date()))}>
            Today
          </button>
        </div>
        <button className="btn" onClick={() => setDate(addDays(date, 1))}>
          Next →
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All games</option>
          <option value="live">Live</option>
          <option value="upcoming">Upcoming</option>
          <option value="final">Final</option>
        </select>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Times in your local zone: {tz}
        </div>
      </div>

      {loading && <div style={{ color: "#475569" }}>Loading scores…</div>}
      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>⚾️</div>
          <div style={{ marginTop: 8, color: "#334155", fontWeight: 600 }}>
            No MLB games found for {date}.
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Try another date.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((g) => {
            const showLead = g.isLive || g.isFinal;
            const homeScore = typeof g.home.score === "number" ? g.home.score : null;
            const awayScore = typeof g.away.score === "number" ? g.away.score : null;
            const homeLeading =
              showLead &&
              homeScore !== null &&
              awayScore !== null &&
              homeScore > awayScore;
            const awayLeading =
              showLead &&
              homeScore !== null &&
              awayScore !== null &&
              awayScore > homeScore;

            return (
              <div
                key={g.id}
                className="card two-col"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 300px",
                  gap: 12,
                }}
              >
                <div className="left-stack" style={{ padding: 12, display: "grid", gap: 10 }}>
                  <TeamRowWithScore team={g.home} role="home" leading={homeLeading} />
                  <TeamRowWithScore team={g.away} role="away" leading={awayLeading} />
                </div>
                <div
                  className="right-info"
                  style={{
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    alignContent: "start",
                    borderLeft: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="label">Status:</span>
                    <StatusPill text={statusWithInning(g)} />
                    {extrasBadge(g)}
                    {g.doubleHeader === "Y" && (
                      <span className="pill pill-mini">DH G{g.seriesGameNumber}</span>
                    )}
                  </div>
                  <div>
                    <span className="label">Time:</span> {prettyTime(g.gameDate, tz)}
                  </div>
                  <div>
                    <span className="label">Location:</span> {g.venue || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---- Standings helpers ----

// Known MLB division IDs → short names for reliability (StatsAPI stable IDs)
const DIVISION_SHORT_BY_ID = {
  200: "AL West",
  201: "AL East",
  202: "AL Central",
  203: "NL West",
  204: "NL East",
  205: "NL Central",
};

// Fallback: convert full league strings to short form
function shortenLeagueString(s) {
  if (!s) return "";
  return s.replace(/^American League/i, "AL").replace(/^National League/i, "NL").replace(/\s+/g, " ").trim();
}

function getDivisionShortName(rec) {
  const div = rec?.division || {};
  const id = div?.id;
  if (id && DIVISION_SHORT_BY_ID[id]) return DIVISION_SHORT_BY_ID[id];
  // If ID is missing, try the division name (e.g., "American League East")
  const fromName = shortenLeagueString(div?.name);
  if (fromName) return fromName;
  // Last resort: league (e.g., "American League")
  const fromLeague = shortenLeagueString(rec?.league?.name);
  return fromLeague || "Division";
}

function StandingsPanel({ season = CURRENT_SEASON }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [divisions, setDivisions] = useState([]);

  // Shared numeric cell style for perfect digit alignment
  const numCell = {
    padding: 8,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    whiteSpace: "nowrap",
  };

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
        );
        if (!res.ok) throw new Error(`Network ${res.status}`);
        const json = await res.json();
        const recs = (json?.records || []).map((rec) => ({
          name: getDivisionShortName(rec),
          teams: (rec?.teamRecords || []).map((tr) => {
            const { divisionClinched, playoffClinched } = parseClinchFlags(tr);
            return {
              id: tr?.team?.id,
              name: tr?.team?.name,
              abbr:
                tr?.team?.abbreviation ||
                tr?.team?.teamCode?.toUpperCase?.() ||
                "",
              w: tr?.wins,
              l: tr?.losses,
              pct: tr?.winningPercentage,
              gb: tr?.gamesBack,
              divisionClinched,
              wildCardClinched: !divisionClinched && playoffClinched,
            };
          }),
        }));
        if (live) setDivisions(recs);
      } catch (e) {
        if (live) setError(e.message || "Failed to load standings");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [season]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Standings · {season}</h2>
      <BadgesLegend />
      {loading && <div style={{ color: "#475569" }}>Loading standings…</div>}
      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      )}
      {!loading &&
        !error &&
        divisions.map((d, i) => (
          <div key={i} className="card">
            <div
              className="card-head"
              style={{ background: "#f8fafc", display: "flex", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700 }}>{d.name}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                  tableLayout: "fixed",
                }}
              >
                {/* Fixed column widths so numeric columns align vertically across cards */}
                <colgroup>
                  <col /> {/* Team (flex) */}
                  <col style={{ width: 64 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Team</th>
                    <th style={numCell}>W</th>
                    <th style={numCell}>L</th>
                    <th style={numCell}>Pct</th>
                    <th style={numCell}>GB</th>
                  </tr>
                </thead>
                <tbody>
                  {d.teams.map((t) => (
                    <tr key={t.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <TeamLogo id={t.id} abbr={t.abbr} />
                          <a
                            href={TEAM_URLS[t.id] || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            {t.name}
                          </a>
                          {t.divisionClinched && (
                            <span className="pill pill-mini" style={{ marginLeft: 8 }}>
                              DIV 🏆
                            </span>
                          )}
                          {t.wildCardClinched && (
                            <span className="pill pill-mini" style={{ marginLeft: 8 }}>
                              WC 🎟️
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={numCell}>{t.w}</td>
                      <td style={numCell}>{t.l}</td>
                      <td style={numCell}>{Number(t.pct).toFixed(3)}</td>
                      <td style={numCell}>{t.gb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

function leagueShort(idOrName) {
  if (idOrName === 103 || /american/i.test(idOrName)) return "AL";
  if (idOrName === 104 || /national/i.test(idOrName)) return "NL";
  return "";
}

// ---- Playoffs (Division leaders + Wild Cards) ----
function PlayoffsPanel({ season = CURRENT_SEASON }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);

  // Games Back vs cutoff helper
  function gbVsCutoff(team, cutoff) {
    if (!team || !cutoff) return null;
    // Positive if team is behind cutoff; negative if ahead (we clamp later)
    const diff = (cutoff.w - team.w + (team.l - cutoff.l)) / 2;
    return Math.max(0, Number(diff));
  }

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Pull regular season standings and compute seeds per league
        const res = await fetch(
          `${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
        );
        if (!res.ok) throw new Error(`Network ${res.status}`);
        const json = await res.json();
        const byLg = {};
        (json?.records || []).forEach((rec) => {
          const lg = leagueShort(rec?.league?.id || rec?.league?.name) || "League";
          const trs = (rec?.teamRecords || []).map((tr) => {
            const { divisionClinched, playoffClinched } = parseClinchFlags(tr);
            return {
              id: tr?.team?.id,
              name: tr?.team?.name,
              abbr:
                tr?.team?.abbreviation ||
                tr?.team?.teamCode?.toUpperCase?.() ||
                "",
              w: tr?.wins,
              l: tr?.losses,
              pct: Number(tr?.winningPercentage),
              divisionRank: Number(tr?.divisionRank),
              divisionClinched,
              playoffClinched,
            };
          });
          if (!byLg[lg]) byLg[lg] = [];
          byLg[lg].push(...trs);
        });

        // Build seeded lists: 1-3 = division leaders by pct; 4-6 = top non-leaders by pct
        const seededGroups = Object.keys(byLg)
          .sort()
          .map((lg) => {
            const teams = byLg[lg];
            const leaders = teams
              .filter((t) => t.divisionRank === 1)
              .sort((a, b) => b.pct - a.pct)
              .map((t, i) => ({
                ...t,
                seed: i + 1,
                isDivisionLeader: true,
                divisionClinched: !!t.divisionClinched,
              }));

            const others = teams
              .filter((t) => t.divisionRank !== 1)
              .sort((a, b) => b.pct - a.pct);

            const wcSeeded = others.map((t, i) => {
              const seed = i + 4;
              const inField = seed <= 6;
              return {
                ...t,
                seed,
                isDivisionLeader: false,
                wildCardClinched: inField && !!t.playoffClinched && !t.divisionClinched,
              };
            });

            const seeded = [...leaders, ...wcSeeded];

            // Identify wild card cutoff (seed 6) for GB computation
            const cutoff = seeded.find((x) => x.seed === 6);

            // Annotate GB vs playoff cutoff for every team (0 for seeds 1–6)
            const withGb = seeded.map((t) => ({
              ...t,
              gbPlayoffs: t.seed <= 6 ? 0 : gbVsCutoff(t, cutoff),
            }));

            return { league: lg, teams: withGb };
          });

        if (live) setGroups(seededGroups);
      } catch (e) {
        if (live) setError(e.message || "Failed to load playoffs view");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [season]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Playoffs · {season}</h2>
      <BadgesLegend />
      {loading && <div style={{ color: "#475569" }}>Loading playoffs…</div>}
      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      )}
      {!loading &&
        !error &&
        groups.map((g, i) => (
          <div key={i} className="card">
            <div
              className="card-head"
              style={{
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 700 }}>{g.league} Playoffs</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Red line = in above (seeds 1–6), out below
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Seed</th>
                    <th style={{ padding: 8 }}>Team</th>
                    <th style={{ padding: 8, textAlign: "right" }}>W</th>
                    <th style={{ padding: 8, textAlign: "right" }}>L</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Pct</th>
                    <th style={{ padding: 8, textAlign: "right" }}>GB</th>
                  </tr>
                </thead>
                <tbody>
                  {g.teams.map((t) => {
                    const rowStyle = {
                      borderTop: "1px solid #e2e8f0",
                      borderBottom: t.seed === 6 ? "3px solid #ef4444" : undefined,
                    };
                    return (
                      <tr key={t.id} style={rowStyle}>
                        <td style={{ padding: 8 }}>{t.seed}</td>
                        <td style={{ padding: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <TeamLogo id={t.id} abbr={t.abbr} />
                            <a
                              href={TEAM_URLS[t.id] || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
                            >
                              {t.name}
                            </a>
                            {/* Show badges only when mathematically clinched */}
                            {t.divisionClinched && (
                              <span className="pill pill-mini" style={{ marginLeft: 8 }}>
                                DIV 🏆
                              </span>
                            )}
                            {t.wildCardClinched && (
                              <span className="pill pill-mini" style={{ marginLeft: 8 }}>
                                WC 🎟️
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: 8, textAlign: "right" }}>{t.w}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{t.l}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{t.pct.toFixed(3)}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>
                          {t.gbPlayoffs == null ? "—" : t.gbPlayoffs.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

function Tabs({ value, onChange }) {
  const items = [
    { id: "scores", label: "Scores" },
    { id: "standings", label: "Standings" },
    { id: "playoffs", label: "Playoffs" },
  ];
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        background: "#fff",
        padding: 4,
        borderRadius: 12,
        display: "inline-flex",
        gap: 4,
      }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className="btn"
          style={{
            background: value === it.id ? "#0f172a" : "#fff",
            color: value === it.id ? "#fff" : "#0f172a",
            borderColor: "#e2e8f0",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [tz] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"
  );
  const today = useMemo(() => fmtDate(new Date()), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState("scores");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(#f8fafc, #ffffff)" }}>
      <div className="container">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, margin: 0 }}>MLB Daily Dashboard</h1>
            <div style={{ color: "#64748b" }}>Scores, Divisions & Playoffs</div>
          </div>
          <Tabs value={tab} onChange={setTab} />
        </header>
        <main style={{ marginTop: 16 }}>
          {tab === "scores" && <ScoresPanel tz={tz} date={date} setDate={setDate} />}
          {tab === "standings" && <StandingsPanel season={CURRENT_SEASON} />}
          {tab === "playoffs" && <PlayoffsPanel season={CURRENT_SEASON} />}
        </main>
        <footer style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
          Playoffs view seeds 1–6 per league (3 division winners + 3 wild cards). Red line
          separates in/out.
        </footer>
      </div>
    </div>
  );
}
