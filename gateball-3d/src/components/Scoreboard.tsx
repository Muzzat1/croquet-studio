
// Scoreboard component — digital red/white dual-row display
// The toolbar pill (Draw Tools + Reset) is rendered directly below the board
// so it visually adjoins the scoreboard's bottom edge.

export interface ScoreboardProps {
  ballScores: Record<string, { gate1: boolean; gate2: boolean; gate3: boolean; finished: boolean }>;
  onBallSelect?: (ballId: string) => void;
  selectedBall: string | null;
  showBody?: boolean;
  timerValue?: number | null;
  gameTimeValue?: number | null;
}

export default function Scoreboard({ ballScores, onBallSelect, selectedBall, showBody = true, timerValue, gameTimeValue }: ScoreboardProps) {

  const getScore = (id: string) => {
    const s = ballScores[id];
    if (!s) return 0;
    return (s.gate1 ? 1 : 0) + (s.gate2 ? 1 : 0) + (s.gate3 ? 1 : 0) + (s.finished ? 2 : 0);
  };

  const redIds   = ['r1', 'r3', 'r5', 'r7', 'r9'];
  const whiteIds = ['w2', 'w4', 'w6', 'w8', 'w10'];

  const redScores   = redIds.map(id => getScore(id));
  const whiteScores = whiteIds.map(id => getScore(id));

  const redTotal   = redScores.reduce((a, b) => a + b, 0);
  const whiteTotal = whiteScores.reduce((a, b) => a + b, 0);

  const formatDigit = (num: number) => num.toString();
  const formatTotal = (num: number) => num.toString().padStart(2, '0');

  // Digital number segment display
  const Digits = ({ text }: { text: string }) => (
    <div style={{
      fontFamily: "'Share Tech Mono', 'Courier New', monospace",
      color: '#fbbf24',
      fontSize: '30px',
      letterSpacing: '2px',
      lineHeight: '1',
      textShadow: '0 0 6px rgba(251,191,36,0.6)',
    }}>
      {text}
    </div>
  );

  return (
    <div className="scoreboard-container" style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      width: '300px',
      zIndex: 20,
      userSelect: 'none',
      transform: 'scale(0.90)',
      transformOrigin: 'top right',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        
        /* Mobile Responsiveness */
        @media (max-width: 900px), (max-height: 500px) {
          .scoreboard-container {
            top: 10px !important;
            right: 10px !important;
            transform: scale(0.65) !important;
            transform-origin: top right;
          }
        }
        @media (max-width: 650px), (max-height: 420px) {
          .scoreboard-container {
            transform: scale(0.5) !important;
          }
        }

        .sb-ball {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 15px; cursor: pointer;
          box-shadow: inset -2px -2px 6px rgba(0,0,0,0.5), 0 3px 5px rgba(0,0,0,0.6);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .sb-ball:hover { transform: scale(1.15); }
        .sb-ball-selected {
          background: #fde047 !important;
          color: #000000 !important;
          border: 2px solid #ffffff !important;
          box-shadow: 0 0 15px 5px rgba(253, 224, 71, 0.6), inset -2px -2px 6px rgba(0,0,0,0.2) !important;
          transform: scale(1.15);
        }
        .sb-display-bg {
          background: #0a0a0a;
          padding: 7px 12px;
          display: flex;
          align-items: center;
          border-radius: 4px;
          box-shadow: inset 0 0 12px rgba(0,0,0,0.9);
          border: 2px solid #222;
        }
        .sb-toolbar-btn {
          font-size: 11px;
          font-weight: 700;
          padding: 5px 11px;
          border-radius: 16px;
          cursor: pointer;
          border: none;
          letter-spacing: 0.02em;
          white-space: nowrap;
          line-height: 1.2;
        }
        .sb-toolbar-btn:hover { filter: brightness(1.15); }
      `}</style>

      {/* ── Scoreboard body ─────────────────────────────── */}
      {showBody && (
        <div style={{
          boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          borderRadius: '8px 8px 0 0',
          overflow: 'hidden',
          border: '2px solid #444',
          borderBottom: 'none',
        }}>
          {/* Red Team (Top) */}
          <div style={{
            background: 'linear-gradient(to bottom, #ef4444, #991b1b)',
            padding: '10px 12px',
            borderBottom: '2px solid #333',
          }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', paddingLeft: '4px' }}>
              {redIds.map((id, i) => (
                <div
                  key={id}
                  className={`sb-ball ${selectedBall === id ? 'sb-ball-selected' : ''}`}
                  onClick={() => onBallSelect?.(id)}
                  style={{
                    background: '#ef4444', color: '#ffffff', border: '1px solid #fca5a5',
                  }}
                >
                  {(i * 2) + 1}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div className="sb-display-bg" style={{ flex: 1, justifyContent: 'space-between' }}>
                {redScores.map((score, i) => <Digits key={i} text={formatDigit(score)} />)}
              </div>
              <div className="sb-display-bg" style={{ padding: '7px 10px' }}>
                <Digits text={formatTotal(redTotal)} />
              </div>
            </div>
          </div>


          {/* ── Timers (Middle) ── */}
          {timerValue !== undefined && timerValue !== null && gameTimeValue !== undefined && gameTimeValue !== null && (
            <div style={{
              background: timerValue <= 3 ? '#ef4444' : '#9caaa1', // LCD screen green-grey
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '30px',
              borderBottom: '2px solid #333',
              color: timerValue <= 3 ? '#fff' : '#0f172a', // LCD digit dark
              fontFamily: "'Share Tech Mono', 'Courier New', monospace",
              animation: timerValue <= 3 ? 'pulse-red 1s infinite' : 'none',
              textShadow: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', fontWeight: 'bold', lineHeight: '1.2', color: timerValue <= 3 ? '#fee2e2' : '#334155', fontFamily: 'sans-serif', textShadow: 'none', textAlign: 'right' }}>
                    <span>10 SEC</span>
                    <span>TIMER</span>
                 </div>
                 <div style={{ fontSize: '30px', fontWeight: 'bold', letterSpacing: '2px', lineHeight: '1' }}>
                    {timerValue.toString().padStart(2, '0')}
                 </div>
              </div>

              <div style={{ width: '2px', height: '30px', background: 'rgba(15, 23, 42, 0.2)' }}></div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', fontWeight: 'bold', lineHeight: '1.2', color: timerValue <= 3 ? '#fee2e2' : '#334155', fontFamily: 'sans-serif', textShadow: 'none', textAlign: 'right' }}>
                    <span>GAME</span>
                    <span>TIME</span>
                 </div>
                 <div style={{ fontSize: '30px', fontWeight: 'bold', letterSpacing: '2px', lineHeight: '1' }}>
                    {Math.floor(gameTimeValue / 60).toString().padStart(2, '0')}:{(gameTimeValue % 60).toString().padStart(2, '0')}
                 </div>
              </div>
              <style>{`
                @keyframes pulse-red {
                  0% { background: #ef4444; }
                  50% { background: #991b1b; }
                  100% { background: #ef4444; }
                }
              `}</style>
            </div>
          )}

          {/* White Team (Bottom) */}
          <div style={{
            background: 'linear-gradient(to bottom, #f8fafc, #94a3b8)',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div className="sb-display-bg" style={{ flex: 1, justifyContent: 'space-between' }}>
                {whiteScores.map((score, i) => <Digits key={i} text={formatDigit(score)} />)}
              </div>
              <div className="sb-display-bg" style={{ padding: '7px 10px' }}>
                <Digits text={formatTotal(whiteTotal)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', paddingLeft: '4px' }}>
              {whiteIds.map((id, i) => (
                <div
                  key={id}
                  className={`sb-ball ${selectedBall === id ? 'sb-ball-selected' : ''}`}
                  onClick={() => onBallSelect?.(id)}
                  style={{
                    background: '#ffffff', color: '#ef4444', border: '1px solid #cbd5e1',
                  }}
                >
                  {(i * 2) + 2}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
