import React, { useState, useEffect, useRef } from 'react';
import { Gamepad2, Trophy, Home, Settings, Info, Play, Circle, Square, ArrowLeft, X, User, Cpu, Club, Disc, Grid, Target, Clock, Flag, Bomb, MessageSquare, Lock, Edit2, Send, Check, XCircle, Users } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- CLOUD MATCHMAKING LOGIC ---
function useCloudMatchmaking(profile) {
  const [isConnecting, setIsConnecting] = useState(false);

  const hostGame = async (gameId) => {
    setIsConnecting(true);
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', code), {
       gameId, host: profile?.username || 'Player', client: null, state: null, lastUpdated: Date.now()
    });
    setIsConnecting(false);
    return code;
  };

  const joinGame = async (code) => {
    setIsConnecting(true);
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', code);
    const snap = await getDoc(roomRef);
    if (snap.exists() && snap.data().gameId) {
        await updateDoc(roomRef, { client: profile?.username || 'Player' });
        setIsConnecting(false);
        return snap.data().gameId;
    }
    setIsConnecting(false);
    return null;
  };

  return { hostGame, joinGame, isConnecting };
}

// --- APPLE-STYLE DM NOTIFICATION UI ---
function DMInviteNotification({ invite, onAccept, onDeny }) {
  return (
    <div className="fixed top-24 right-6 z-50 animate-in slide-in-from-top-8 fade-in duration-500">
      <div className="w-80 bg-slate-800/90 backdrop-blur-xl border border-slate-600 shadow-2xl shadow-black/50 rounded-3xl overflow-hidden flex flex-col">
        <div className="p-5 flex items-center gap-4">
          <div className="bg-indigo-500/20 p-3 rounded-2xl shrink-0">
            <Gamepad2 className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-white font-bold text-lg leading-tight">Game Invite</h4>
            <p className="text-slate-300 text-sm mt-1 leading-tight">
              <span className="font-bold text-white">{invite.sender}</span> wants to play <span className="font-bold text-white capitalize">{invite.gameId.replace(/([A-Z])/g, ' $1').trim()}</span>.
            </p>
          </div>
        </div>
        <div className="flex border-t border-slate-700/50 bg-slate-800/50">
          <button 
            onClick={() => onDeny(invite.id)} 
            className="flex-1 py-3 text-red-400 hover:bg-slate-700/50 font-medium transition-colors border-r border-slate-700/50 flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Decline
          </button>
          <button 
            onClick={() => onAccept(invite.id, invite.gameId)} 
            className="flex-1 py-3 text-indigo-400 hover:bg-slate-700/50 font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [currentView, setCurrentView] = useState('menu'); 
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameMode, setGameMode] = useState('pvp'); 
  const [roomId, setRoomId] = useState(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showTrophies, setShowTrophies] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [pendingInviteGame, setPendingInviteGame] = useState(null); 
  
  const [settings, setSettings] = useState({ difficulty: 'medium', sound: true, showTrajectory: true });
  const [stats, setStats] = useState({ poolWins: 0, chessWins: 0, solitaireWins: 0, gamesPlayed: 0 });

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [incomingInvites, setIncomingInvites] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Global Listener for Incoming DM Invites
  useEffect(() => {
    if (!profile) return;
    const dmRef = collection(db, 'artifacts', appId, 'public', 'data', 'direct_messages');
    const unsub = onSnapshot(dmRef, (snap) => {
       const invites = [];
       snap.forEach(doc => {
          const data = doc.data();
          if (data.type === 'invite' && 
              data.recipient.toLowerCase() === profile.username.toLowerCase() && 
              data.status === 'pending') {
              invites.push({ id: doc.id, ...data });
          }
       });
       setIncomingInvites(invites);
    }, err => console.error("Invite sync error:", err));
    return () => unsub();
  }, [profile]);

  useEffect(() => {
    if (gameMode === 'online-host' && roomId && currentView === 'setup' && selectedGame) {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId);
      const unsub = onSnapshot(roomRef, (snap) => {
         if (snap.exists() && snap.data().client) {
             setShowSocial(false);
             setPendingInviteGame(null);
             navigate(selectedGame, selectedGame, roomId);
         }
      });
      return () => unsub();
    }
  }, [gameMode, roomId, currentView, selectedGame]);

  const handleAcceptInvite = async (id, gameId, roomCode) => {
      try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'direct_messages', id), { status: 'accepted' });
          if (roomCode) {
              setGameMode('online-client');
              await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomCode), { client: profile.username });
              navigate(gameId, gameId, roomCode);
          } else {
              navigate(gameId);
          }
      } catch (e) { console.error(e); }
  };

  const handleDeclineInvite = async (id) => {
      try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'direct_messages', id), { status: 'declined' });
      } catch (e) { console.error(e); }
  };

  const navigate = (view, gameId = null, rId = null) => {
    if (gameId) setSelectedGame(gameId);
    setRoomId(rId || null);
    setCurrentView(view);
  };

  const openSocialForInvite = async (gameId) => {
      const code = Math.random().toString(36).substring(2, 7).toUpperCase();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', code), {
          gameId, host: profile.username, client: null, state: null, lastUpdated: Date.now()
      });
      setGameMode('online-host');
      setRoomId(code);
      setPendingInviteGame({ gameId, code });
      setShowSocial(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Global Notifications overlay */}
      {incomingInvites.map(inv => (
          <DMInviteNotification 
            key={inv.id} 
            invite={inv} 
            onAccept={(id, gameId) => handleAcceptInvite(id, gameId, inv.roomCode)} 
            onDeny={handleDeclineInvite} 
          />
      ))}

      <header className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
              Arcade Hub
            </h1>
          </div>
          <nav className="flex gap-4">
            <button onClick={() => navigate('menu')} className={`p-2 rounded-md transition-colors ${currentView === 'menu' ? 'text-indigo-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
              <Home className="w-5 h-5" />
            </button>
            <button onClick={() => setShowTrophies(true)} className="p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <Trophy className="w-5 h-5" />
            </button>
            <button onClick={() => { setPendingInviteGame(null); setShowSocial(true); }} className="p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <MessageSquare className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {!profile ? (
           <LoginScreen user={user} setProfile={setProfile} />
        ) : (
           <>
            {currentView === 'menu' && <GameMenu navigate={navigate} />}
            {currentView === 'setup' && <GameSetup gameId={selectedGame} navigate={navigate} setGameMode={setGameMode} openSocialForInvite={openSocialForInvite} profile={profile} />}
            {currentView === 'pool' && <PoolGame navigate={navigate} mode={gameMode} settings={settings} roomId={roomId} playerProfile={profile} />}
            {currentView === 'chess' && <ChessGame navigate={navigate} mode={gameMode} settings={settings} roomId={roomId} />}
            {currentView === 'solitaire' && <SolitaireGame navigate={navigate} />}
            {currentView === 'foosball' && <FoosballGame navigate={navigate} mode={gameMode} settings={settings} />}
            {currentView === 'pong' && <PongGame navigate={navigate} mode={gameMode} settings={settings} roomId={roomId} />}
            {currentView === 'connect4' && <Connect4Game navigate={navigate} mode={gameMode} settings={settings} roomId={roomId} />}
            {currentView === 'snake' && <SnakeGame navigate={navigate} />}
            {currentView === 'airhockey' && <AirHockeyGame navigate={navigate} mode="pvai" settings={settings} />}
            {currentView === 'pacman' && <PacManGame navigate={navigate} />}
            {currentView === 'minesweeper' && <MinesweeperGame navigate={navigate} />}
           </>
        )}
      </main>

      {showSettings && <SettingsModal close={() => setShowSettings(false)} settings={settings} setSettings={setSettings} profile={profile} setProfile={setProfile} user={user} />}
      {showTrophies && <TrophyModal close={() => setShowTrophies(false)} stats={stats} />}
      {showSocial && profile && <SocialModal close={() => setShowSocial(false)} user={user} profile={profile} setProfile={setProfile} pendingInviteGame={pendingInviteGame} />}
    </div>
  );
}

// --- LOGIN & ACCOUNT COMPONENTS ---
function LoginScreen({ user, setProfile }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleJoin = async (e) => {
     e.preventDefault();
     setError('');
     const cleanUser = username.trim().toLowerCase();
     if (!cleanUser || !password || !user) return;
     
     setLoading(true);
     try {
         const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', cleanUser);
         const snap = await getDoc(profileRef);
         
         if (snap.exists()) {
             const data = snap.data();
             if (data.password === password) {
                 setProfile({ username: data.username, ...data });
             } else {
                 setError('Incorrect password for this username.');
             }
         } else {
             const newProfile = { 
                 username: username.trim(), 
                 password: password, 
                 joinedAt: Date.now(),
                 friends: [], 
                 stats: { gamesPlayed: 0, wins: 0 } 
             };
             await setDoc(profileRef, newProfile);
             setProfile(newProfile);
         }
     } catch (err) {
         console.error(err);
         setError('Connection error. Please try again.');
     }
     setLoading(false);
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500 max-w-md mx-auto mt-20 text-center">
      <div className="bg-slate-800 p-8 rounded-3xl border-2 border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-3">
            <Gamepad2 className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Arcade Login</h2>
        <p className="text-slate-400 mb-6 text-sm">Enter a username and password. If the username is new, it will create a new account.</p>
        
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div className="space-y-3">
                <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username" 
                        maxLength={16}
                        className="w-full bg-slate-900 border-2 border-slate-700 focus:border-indigo-500 rounded-xl pl-12 pr-4 py-3 text-white font-bold text-lg outline-none transition-colors placeholder:text-slate-600"
                        disabled={loading || !user}
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password" 
                        maxLength={30}
                        className="w-full bg-slate-900 border-2 border-slate-700 focus:border-indigo-500 rounded-xl pl-12 pr-4 py-3 text-white font-bold text-lg outline-none transition-colors placeholder:text-slate-600"
                        disabled={loading || !user}
                    />
                </div>
            </div>
            
            {error && <p className="text-red-400 font-medium text-sm animate-pulse">{error}</p>}
            
            <button 
                type="submit" 
                disabled={loading || !user || !username.trim() || !password}
                className="mt-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-lg py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Connecting...' : !user ? 'Authenticating...' : 'Enter Arcade'}
            </button>
        </form>
        <p className="text-xs text-slate-500 mt-6">For your security, please use a simple/fake password just for this arcade!</p>
      </div>
    </div>
  );
}

// --- MENU COMPONENT ---
function GameMenu({ navigate }) {
  const games = [
    { id: 'pool', title: '8-Ball Pool', desc: 'Realistic physics, real rules, and turn timers.', color: 'from-emerald-500 to-teal-700', active: true },
    { id: 'chess', title: 'Grandmaster Chess', desc: 'Classic strategy game with a 10-minute clock.', color: 'from-slate-600 to-slate-800', active: true },
    { id: 'solitaire', title: 'Klondike Solitaire', desc: 'Drag and drop cards to build the 4 foundations!', color: 'from-blue-500 to-indigo-700', active: true, singlePlayer: true },
    { id: 'foosball', title: 'Table Foosball', desc: 'Fast-paced physics table soccer. First to 5 wins!', color: 'from-orange-500 to-red-700', active: true },
    { id: 'airhockey', title: 'Air Hockey', desc: 'Smash the puck into the goal! Play vs AI.', color: 'from-cyan-500 to-blue-700', active: true, singlePlayer: true }, 
    { id: 'pong', title: 'Retro Pong', desc: 'The arcade classic. First to 5 wins.', color: 'from-purple-500 to-pink-700', active: true },
    { id: 'connect4', title: 'Connect 4', desc: 'Drop your tokens and get 4 in a row against a smart AI.', color: 'from-yellow-500 to-orange-600', active: true },
    { id: 'snake', title: 'Classic Snake', desc: 'Eat the apples and grow your tail!', color: 'from-lime-500 to-green-700', active: true, singlePlayer: true },
    { id: 'pacman', title: 'Pac-Man', desc: 'Eat pellets, dodge ghosts, grab power-ups!', color: 'from-yellow-400 to-amber-600', active: true, singlePlayer: true },
    { id: 'minesweeper', title: 'Minesweeper', desc: 'Clear the board without triggering any mines!', color: 'from-slate-400 to-slate-600', active: true, singlePlayer: true },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10 text-center space-y-4">
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Select a Game</h2>
        <p className="text-slate-400 max-w-2xl mx-auto text-lg">
          Welcome to the arcade. Choose a game below to play locally with a friend or against the computer!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {games.map((game) => (
          <div key={game.id} onClick={() => game.active ? navigate(game.singlePlayer ? game.id : 'setup', game.id) : null} className={`relative group overflow-hidden rounded-2xl border border-slate-700/50 p-1 transition-all duration-300 ${game.active ? 'cursor-pointer hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-1' : 'opacity-75 grayscale-[0.5] cursor-not-allowed'}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-20 group-hover:opacity-30 transition-opacity`} />
            <div className="relative bg-slate-900/80 backdrop-blur-sm p-6 rounded-xl h-full flex flex-col items-start">
              <div className="flex justify-between w-full items-start mb-4">
                <h3 className="text-xl font-bold text-white">{game.title}</h3>
              </div>
              <p className="text-slate-400 text-sm mb-6 flex-grow">{game.desc}</p>
              <button className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition-all w-full justify-center ${game.active ? 'bg-slate-800 hover:bg-indigo-600 text-white border border-slate-700 hover:border-indigo-500' : 'bg-slate-800 text-slate-500 border border-slate-700'}`} disabled={!game.active}>
                <Play className="w-4 h-4" fill={game.active ? "currentColor" : "none"} />
                Launch
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- GAME SETUP MENUS ---
function GameSetup({ gameId, navigate, setGameMode, openSocialForInvite, profile }) {
  const [setupView, setSetupView] = useState('main'); 
  const [joinCode, setJoinCode] = useState('');
  
  const { hostGame, joinGame, isConnecting } = useCloudMatchmaking(profile);

  if (setupView === 'online') {
    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 max-w-5xl mx-auto mt-12 relative">
        <button onClick={() => setSetupView('main')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Local
        </button>
        
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Online Multiplayer Lobby</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-2xl border-2 border-indigo-500/30 flex flex-col justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">Host a Game</h3>
                    <p className="text-sm text-slate-400 mb-6">Create a room and share the code manually.</p>
                </div>
                <button onClick={async () => {
                    const code = await hostGame(gameId);
                    setGameMode('online-host');
                    navigate(gameId, gameId, code);
                }} disabled={isConnecting} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all">
                    {isConnecting ? 'Creating...' : 'Generate Code'}
                </button>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border-2 border-cyan-500/30 flex flex-col justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">Join a Game</h3>
                    <p className="text-sm text-slate-400 mb-6">Enter a 5-character code to join a room.</p>
                </div>
                <div>
                    <input 
                        type="text" 
                        placeholder="ARC9X" 
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={5}
                        className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-white font-bold text-center mb-4 outline-none uppercase tracking-widest"
                    />
                    <button onClick={async () => {
                        const joinedGameId = await joinGame(joinCode);
                        if (joinedGameId) {
                            setGameMode('online-client');
                            navigate(joinedGameId, joinedGameId, joinCode);
                        } else {
                            alert("Invalid Room Code.");
                        }
                    }} disabled={joinCode.length < 5 || isConnecting} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all">
                        {isConnecting ? 'Joining...' : 'Join Room'}
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border-2 border-purple-500/30 flex flex-col justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">Invite via DM</h3>
                    <p className="text-sm text-slate-400 mb-6">Send a direct request to a friend's inbox.</p>
                </div>
                <button onClick={() => openSocialForInvite(gameId)} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" /> Open Friends List
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300 max-w-4xl mx-auto mt-12">
      <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg mb-8">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
        <h2 className="text-3xl font-bold text-white mb-8 text-center capitalize">{gameId.replace(/([A-Z])/g, ' $1').trim()} - Setup</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
          <button onClick={() => { setGameMode('pvp'); navigate(gameId); }} className="flex flex-col items-center justify-center gap-4 p-8 bg-slate-900 rounded-2xl border-2 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 transition-all group">
            <div className="flex gap-2">
              <User className="w-12 h-12 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              <User className="w-12 h-12 text-slate-400 group-hover:text-indigo-400 transition-colors" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-1">Local 2-Player</h3>
              <p className="text-sm text-slate-400">Play against a friend on one screen.</p>
            </div>
          </button>

          <button onClick={() => { setGameMode('pvai'); navigate(gameId); }} className="flex flex-col items-center justify-center gap-4 p-8 bg-slate-900 rounded-2xl border-2 border-slate-700 hover:border-emerald-500 hover:bg-slate-800 transition-all group">
            <div className="flex gap-4">
              <User className="w-12 h-12 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              <Cpu className="w-12 h-12 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-1">vs Computer</h3>
              <p className="text-sm text-slate-400">Challenge the AI.</p>
            </div>
          </button>

          {/* ONLINE BUTTON - DISABLED WITH FUTURE UPDATE STICKER FOR POOL AND PONG */}
          <button 
            onClick={() => (gameId === 'pool' || gameId === 'pong') ? null : setSetupView('online')} 
            className={`flex flex-col items-center justify-center gap-4 p-8 bg-slate-900 rounded-2xl border-2 transition-all group relative overflow-hidden ${(gameId === 'pool' || gameId === 'pong') ? 'border-slate-800 opacity-60 cursor-not-allowed' : 'border-slate-700 hover:border-cyan-500 hover:bg-slate-800'}`}
          >
            {(gameId === 'pool' || gameId === 'pong') && (
                <div className="absolute top-5 right-[-30px] bg-amber-500 text-black text-[10px] font-extrabold uppercase tracking-wider px-10 py-1.5 rotate-45 shadow-lg">
                    Future Update
                </div>
            )}
            <div className="flex gap-2">
              <Grid className={`w-12 h-12 transition-colors ${(gameId === 'pool' || gameId === 'pong') ? 'text-slate-600' : 'text-slate-400 group-hover:text-cyan-400'}`} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-1">Online Match</h3>
              <p className="text-sm text-slate-400">{(gameId === 'pool' || gameId === 'pong') ? 'Multiplayer coming soon.' : 'Host or Join a game with a friend.'}</p>
            </div>
          </button>

        </div>
      </div>
    </div>
  );
}

// --- POOL GAME ---
function PoolGame({ navigate, mode, settings, roomId, playerProfile }) {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('aiming'); 
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [turn, setTurn] = useState('Player 1'); 
  const [playerColor, setPlayerColor] = useState(null); 
  const [timeLeft, setTimeLeft] = useState(30);
  const [winner, setWinner] = useState(null);
  
  const stateRef = useRef({ gameState: 'aiming', turn: 'Player 1', balls: [], aiTimeout: null });
  const syncRef = useRef(0);

  // Network Sync Listener
  useEffect(() => {
      if (!roomId || !mode.startsWith('online')) return;
      const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), (snap) => {
          if (snap.exists() && snap.data().state) {
              const st = snap.data().state;
              const isMyTurn = (mode === 'online-host' && st.turn === 'Player 1') ||
                               (mode === 'online-client' && st.turn === 'Player 2');
              
              if (st.playerColor && !playerColor) setPlayerColor(st.playerColor);
              if (st.winner && !winner) setWinner(st.winner);
              
              if (!isMyTurn) {
                  if (st.balls) stateRef.current.balls = typeof st.balls === 'string' ? JSON.parse(st.balls) : st.balls;
                  setGameState(st.gameState);
                  setTurn(st.turn);
                  setP1Score(st.p1Score);
                  setP2Score(st.p2Score);
                  if (st.timeLeft !== undefined) setTimeLeft(st.timeLeft);
              }
          }
      });
      return () => unsub();
  }, [roomId, mode, playerColor, winner]);

  useEffect(() => {
      if (!playerColor || winner || gameState !== 'aiming') return;
      const id = setInterval(() => {
          setTimeLeft(t => {
              if (t <= 1) {
                  const isMyTurn = (mode === 'online-host' && turn === 'Player 1') ||
                                   (mode === 'online-client' && turn === 'Player 2') ||
                                   !mode.startsWith('online');
                  if (isMyTurn) {
                      const nextTurn = turn === 'Player 1' ? (mode === 'pvai' ? 'Computer' : 'Player 2') : 'Player 1';
                      setTurn(nextTurn);
                      if (mode.startsWith('online') && roomId) {
                          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                              'state.turn': nextTurn, 'state.timeLeft': 30
                          }).catch(()=>{});
                      }
                      return 30;
                  }
                  return 0; // Wait for DB sync
              }
              return t - 1;
          });
      }, 1000);
      return () => clearInterval(id);
  }, [turn, gameState, playerColor, winner, mode, roomId]);

  useEffect(() => {
    stateRef.current.turn = turn;
    stateRef.current.gameState = gameState;
  }, [turn, gameState]);

  useEffect(() => {
    if (!playerColor || winner) return;
    const canvas = canvasRef.current;
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const FRICTION = 0.985;
    const BALL_RADIUS = 12;
    const POCKET_RADIUS = 20;
    const TABLE_WIDTH = 800;
    const TABLE_HEIGHT = 400;
    const BORDER_SIZE = 30;

    const bounds = {
      left: BORDER_SIZE + BALL_RADIUS,
      right: TABLE_WIDTH - BORDER_SIZE - BALL_RADIUS,
      top: BORDER_SIZE + BALL_RADIUS,
      bottom: TABLE_HEIGHT - BORDER_SIZE - BALL_RADIUS
    };

    const pockets = [
      { x: BORDER_SIZE, y: BORDER_SIZE }, { x: TABLE_WIDTH / 2, y: BORDER_SIZE - 5 }, { x: TABLE_WIDTH - BORDER_SIZE, y: BORDER_SIZE },
      { x: BORDER_SIZE, y: TABLE_HEIGHT - BORDER_SIZE }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - BORDER_SIZE + 5 }, { x: TABLE_WIDTH - BORDER_SIZE, y: TABLE_HEIGHT - BORDER_SIZE }
    ];

    if (stateRef.current.balls.length === 0) {
        let initBalls = [
          { id: 'cue', x: 200, y: 200, vx: 0, vy: 0, color: '#ffffff', isCue: true },
          { id: 1, x: 550, y: 200, vx: 0, vy: 0, color: '#ef4444' }, { id: 2, x: 572, y: 188, vx: 0, vy: 0, color: '#3b82f6' }, 
          { id: 3, x: 572, y: 212, vx: 0, vy: 0, color: '#ef4444' }, { id: 4, x: 594, y: 176, vx: 0, vy: 0, color: '#ef4444' }, 
          { id: 5, x: 594, y: 200, vx: 0, vy: 0, color: '#111827' }, { id: 6, x: 594, y: 224, vx: 0, vy: 0, color: '#3b82f6' }, 
          { id: 7, x: 616, y: 164, vx: 0, vy: 0, color: '#3b82f6' }, { id: 8, x: 616, y: 188, vx: 0, vy: 0, color: '#ef4444' }, 
          { id: 9, x: 616, y: 212, vx: 0, vy: 0, color: '#3b82f6' }, { id: 10, x: 616, y: 236, vx: 0, vy: 0, color: '#ef4444' }, 
        ];
        stateRef.current.balls = initBalls;
    }
    
    let balls = stateRef.current.balls;
    let isDragging = false; let mousePos = { x: 0, y: 0 }; let dragStart = { x: 0, y: 0 }; let wasMoving = false;
    let pottedOwnBallThisTurn = false;
    let scratchThisTurn = false;

    const triggerAI = () => {
      if (stateRef.current.aiTimeout || mode.startsWith('online')) return;
      stateRef.current.aiTimeout = setTimeout(() => {
        const currentBalls = stateRef.current.balls;
        const cueBall = currentBalls.find(b => b.isCue);
        const aiColor = playerColor === '#ef4444' ? '#3b82f6' : '#ef4444';
        let targets = currentBalls.filter(b => !b.isCue && b.color === aiColor);
        if (targets.length === 0) targets = currentBalls.filter(b => b.id === 5);
        
        if (cueBall && targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          let dx = target.x - cueBall.x; let dy = target.y - cueBall.y;
          const inaccuracy = settings.difficulty === 'easy' ? 40 : settings.difficulty === 'medium' ? 20 : 5;
          dx += (Math.random() - 0.5) * inaccuracy; dy += (Math.random() - 0.5) * inaccuracy;

          const dist = Math.sqrt(dx*dx + dy*dy);
          const power = Math.min(25, (dist / 10) + 5); 

          cueBall.vx = (dx / dist) * power; cueBall.vy = (dy / dist) * power;
          setTimeLeft(30);
          setGameState('moving');
        }
        stateRef.current.aiTimeout = null;
      }, 1500);
    };

    const updatePhysics = () => {
      const isMyTurn = (mode === 'online-host' && stateRef.current.turn === 'Player 1') ||
                       (mode === 'online-client' && stateRef.current.turn === 'Player 2') ||
                       !mode.startsWith('online');
      
      if (!isMyTurn) {
          balls = stateRef.current.balls;
          return;
      }

      let isMoving = false;
      balls.forEach(ball => {
        ball.vx *= FRICTION; ball.vy *= FRICTION;
        if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
        if (Math.abs(ball.vy) < 0.05) ball.vy = 0;
        if (ball.vx !== 0 || ball.vy !== 0) isMoving = true;
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.x < bounds.left) { ball.x = bounds.left; ball.vx *= -1; }
        if (ball.x > bounds.right) { ball.x = bounds.right; ball.vx *= -1; }
        if (ball.y < bounds.top) { ball.y = bounds.top; ball.vy *= -1; }
        if (ball.y > bounds.bottom) { ball.y = bounds.bottom; ball.vy *= -1; }
      });

      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const b1 = balls[i]; const b2 = balls[j];
          const dx = b2.x - b1.x; const dy = b2.y - b1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BALL_RADIUS * 2) {
            const overlap = (BALL_RADIUS * 2) - dist;
            const nx = dx / dist; const ny = dy / dist;
            b1.x -= nx * (overlap / 2); b1.y -= ny * (overlap / 2);
            b2.x += nx * (overlap / 2); b2.y += ny * (overlap / 2);
            const kx = b1.vx - b2.vx; const ky = b1.vy - b2.vy;
            const p = 2 * (nx * kx + ny * ky) / 2; 
            b1.vx -= p * nx; b1.vy -= p * ny; b2.vx += p * nx; b2.vy += p * ny;
          }
        }
      }

      for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i]; let pocketed = false;
        for (let p of pockets) {
          const dx = ball.x - p.x; const dy = ball.y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < POCKET_RADIUS) { pocketed = true; break; }
        }
        if (pocketed) {
          if (ball.isCue) {
            ball.x = 200; ball.y = 200; ball.vx = 0; ball.vy = 0;
            scratchThisTurn = true;
          } else {
            balls.splice(i, 1);
            if (ball.id === 5) {
                const isP1Turn = stateRef.current.turn === 'Player 1';
                const requiredScore = 5; 
                if (isP1Turn) {
                    if (p1Score >= requiredScore && !scratchThisTurn) setWinner('Player 1');
                    else setWinner(mode === 'pvai' ? 'Computer' : 'Player 2');
                } else {
                    if (p2Score >= requiredScore && !scratchThisTurn) setWinner(mode === 'pvai' ? 'Computer' : 'Player 2');
                    else setWinner('Player 1');
                }
            } else {
                const isP1Turn = stateRef.current.turn === 'Player 1';
                if (ball.color === playerColor) {
                    setP1Score(prev => prev + 1);
                    if (isP1Turn) pottedOwnBallThisTurn = true;
                } else if (ball.color === (playerColor === '#ef4444' ? '#3b82f6' : '#ef4444')) {
                    setP2Score(prev => prev + 1);
                    if (!isP1Turn) pottedOwnBallThisTurn = true;
                }
            }
          }
        }
      }

      if (wasMoving && !isMoving) {
        setGameState('aiming');
        setTimeLeft(30);
        if (!pottedOwnBallThisTurn || scratchThisTurn) {
            setTurn(stateRef.current.turn === 'Player 1' ? (mode === 'pvai' ? 'Computer' : 'Player 2') : 'Player 1');
        }
        pottedOwnBallThisTurn = false;
        scratchThisTurn = false;
      }
      wasMoving = isMoving;
      stateRef.current.balls = balls;

      // Sync physics to DB if active
      if (mode.startsWith('online') && isMyTurn) {
          if (Date.now() - syncRef.current > 100 || (wasMoving && !isMoving)) {
              updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                  state: { balls: JSON.stringify(stateRef.current.balls), turn: stateRef.current.turn, gameState: stateRef.current.gameState, p1Score, p2Score, playerColor, winner, timeLeft }
              }).catch(()=>{});
              syncRef.current = Date.now();
          }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      ctx.fillStyle = '#654321'; ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      ctx.fillStyle = '#065f46'; ctx.fillRect(BORDER_SIZE, BORDER_SIZE, TABLE_WIDTH - BORDER_SIZE*2, TABLE_HEIGHT - BORDER_SIZE*2);
      ctx.fillStyle = '#111827'; 
      pockets.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2); ctx.fill(); });

      const cueBall = balls.find(b => b.isCue);
      if (cueBall && isDragging && stateRef.current.gameState === 'aiming' && stateRef.current.turn !== 'Computer') {
        const dx = dragStart.x - mousePos.x; const dy = dragStart.y - mousePos.y;
        if (settings.showTrajectory) {
            ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(cueBall.x + dx * 2, cueBall.y + dy * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.beginPath(); ctx.moveTo(cueBall.x - dx * 0.2, cueBall.y - dy * 0.2); ctx.lineTo(cueBall.x - dx, cueBall.y - dy);
        ctx.strokeStyle = '#d97706'; ctx.lineWidth = 6; ctx.stroke();
      }

      balls.forEach(ball => {
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = ball.color; ctx.fill();
        ctx.beginPath(); ctx.arc(ball.x - 3, ball.y - 3, BALL_RADIUS / 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        if (ball.color === '#111827' && !ball.isCue) {
            ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS / 2, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();
        }
      });
    };

    const gameLoop = () => {
      updatePhysics(); draw();
      if (stateRef.current.gameState === 'aiming' && stateRef.current.turn === 'Computer') triggerAI();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    };
    const handleMouseDown = (e) => {
      const isMyTurn = (mode === 'online-host' && stateRef.current.turn === 'Player 1') ||
                       (mode === 'online-client' && stateRef.current.turn === 'Player 2') ||
                       !mode.startsWith('online');
      if (!isMyTurn || stateRef.current.gameState !== 'aiming' || stateRef.current.turn === 'Computer') return;
      isDragging = true; dragStart = getMousePos(e); mousePos = dragStart;
    };
    const handleMouseMove = (e) => { if (isDragging) mousePos = getMousePos(e); };
    const handleMouseUp = () => {
      const isMyTurn = (mode === 'online-host' && stateRef.current.turn === 'Player 1') ||
                       (mode === 'online-client' && stateRef.current.turn === 'Player 2') ||
                       !mode.startsWith('online');
      if (!isMyTurn || !isDragging || stateRef.current.gameState !== 'aiming') return;
      isDragging = false;
      const cueBall = balls.find(b => b.isCue);
      if (cueBall) {
        const dx = dragStart.x - mousePos.x; const dy = dragStart.y - mousePos.y;
        cueBall.vx = dx * 0.15; cueBall.vy = dy * 0.15;
        const speed = Math.sqrt(cueBall.vx**2 + cueBall.vy**2);
        if (speed > 25) { cueBall.vx = (cueBall.vx / speed) * 25; cueBall.vy = (cueBall.vy / speed) * 25; }
        setTimeLeft(30);
        setGameState('moving');
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    gameLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(stateRef.current.aiTimeout);
      if (canvas) { canvas.removeEventListener('mousedown', handleMouseDown); canvas.removeEventListener('mousemove', handleMouseMove); }
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mode, settings.difficulty, settings.showTrajectory, playerColor, winner]);

  const pickColor = async (color) => {
      setPlayerColor(color);
      if (mode === 'online-host' && roomId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
              'state.playerColor': color
          });
      }
  };

  if (!playerColor) {
    if (mode === 'online-client') {
        return <div className="animate-in fade-in zoom-in-95 duration-300 max-w-xl mx-auto text-center mt-12"><h2 className="text-3xl font-bold text-white">Waiting for Host to choose colors...</h2></div>;
    }
    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 max-w-xl mx-auto text-center mt-12">
        <h2 className="text-3xl font-bold text-white mb-8">Choose Your Color</h2>
        <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <button onClick={() => pickColor('#ef4444')} className="w-full md:w-auto bg-slate-800 p-8 rounded-2xl border-4 border-red-500 hover:bg-slate-700 transition-colors">
                <div className="w-16 h-16 rounded-full bg-red-500 mx-auto shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.5)]"></div>
                <p className="mt-4 text-white font-bold text-xl">Solids (Red)</p>
            </button>
            <button onClick={() => pickColor('#3b82f6')} className="w-full md:w-auto bg-slate-800 p-8 rounded-2xl border-4 border-blue-500 hover:bg-slate-700 transition-colors">
                <div className="w-16 h-16 rounded-full bg-blue-500 mx-auto shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.5)]"></div>
                <p className="mt-4 text-white font-bold text-xl">Stripes (Blue)</p>
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">8-Ball {mode === 'pvai' ? 'vs AI' : 'PvP'}</h2>
          <div className="inline-flex items-center gap-4 mt-1 px-4 py-1 bg-slate-800 rounded-full border border-slate-700">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${turn === 'Player 1' ? 'bg-emerald-400' : 'bg-indigo-400 animate-pulse'}`} />
                <span className="text-sm font-medium text-slate-300">{turn}'s Turn</span>
            </div>
            <div className={`flex items-center gap-1 text-sm font-mono ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
                <Clock className="w-4 h-4" /> {timeLeft}s
            </div>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className="text-slate-300 font-mono text-sm">P1 ({playerColor === '#ef4444' ? 'Red' : 'Blue'}): <span className="text-emerald-400 font-bold">{p1Score}/5</span></p>
          <p className="text-slate-300 font-mono text-sm">{mode === 'pvai' ? 'AI' : 'P2'} ({playerColor === '#ef4444' ? 'Blue' : 'Red'}): <span className="text-indigo-400 font-bold">{p2Score}/5</span></p>
        </div>
      </div>
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center">
        <div className="w-full max-w-[800px] aspect-[2/1] bg-black rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-8 border-amber-900 relative">
           <canvas ref={canvasRef} width={800} height={400} className={`w-full h-full block touch-none ${turn === 'Computer' ? 'cursor-wait' : 'cursor-crosshair'}`} />
           {winner && (
               <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                   <h2 className="text-5xl font-bold text-amber-400 mb-4">{winner} Wins!</h2>
                   <button onClick={() => navigate('menu')} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold">Back to Arcade</button>
               </div>
           )}
        </div>
      </div>
    </div>
  );
}

// --- CHESS GAME ---
function ChessGame({ navigate, mode, settings, roomId }) {
  const initialBoard = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ];

  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState('w'); 
  const [selectedPiece, setSelectedPiece] = useState(null); 
  const [gameStatus, setGameStatus] = useState(''); 
  
  const [wTime, setWTime] = useState(600);
  const [bTime, setBTime] = useState(600);

  useEffect(() => {
      if (!roomId || !mode.startsWith('online')) return;
      const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), (snap) => {
          if (snap.exists() && snap.data().state) {
              const st = snap.data().state;
              if (st.board) setBoard(typeof st.board === 'string' ? JSON.parse(st.board) : st.board);
              setTurn(st.turn);
              setGameStatus(st.gameStatus);
              if (st.wTime !== undefined) setWTime(st.wTime);
              if (st.bTime !== undefined) setBTime(st.bTime);
          }
      });
      return () => unsub();
  }, [roomId, mode]);

  useEffect(() => {
      if (gameStatus === 'Checkmate!' || gameStatus === 'Stalemate!' || gameStatus.includes('Timeout')) return;
      
      const id = setInterval(() => {
          if (turn === 'w') {
              setWTime(t => {
                  if (t <= 1) { setGameStatus('Black Wins by Timeout!'); return 0; }
                  return t - 1;
              });
          } else { 
              setBTime(t => {
                  if (t <= 1) { setGameStatus('White Wins by Timeout!'); return 0; }
                  return t - 1;
              });
          }
      }, 1000);
      return () => clearInterval(id);
  }, [turn, gameStatus]);

  const pieceSymbols = { 
      'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟', 
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' 
  };

  const formatTime = (secs) => {
      const m = Math.floor(secs / 60); const s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isPathClear = (r1, c1, r2, c2, testBoard = board) => {
    const dr = Math.sign(r2 - r1); const dc = Math.sign(c2 - c1);
    let r = r1 + dr; let c = c1 + dc;
    while (r !== r2 || c !== c2) { if (testBoard[r][c] !== '') return false; r += dr; c += dc; }
    return true;
  };

  const isValidMoveLogic = (piece, fromR, fromC, toR, toC, isCapture, testBoard = board) => {
    const type = piece.toLowerCase();
    const dr = toR - fromR; const dc = toC - fromC;
    const absDr = Math.abs(dr); const absDc = Math.abs(dc);
    if (type === 'p') {
      const dir = piece === 'P' ? -1 : 1; const startRow = piece === 'P' ? 6 : 1;
      if (!isCapture && dc === 0) {
        if (dr === dir && testBoard[toR][toC] === '') return true;
        if (dr === 2 * dir && fromR === startRow && testBoard[fromR + dir][fromC] === '' && testBoard[toR][toC] === '') return true;
      }
      if (isCapture && absDc === 1 && dr === dir) return true;
      return false;
    }
    if (type === 'r') return (dr === 0 || dc === 0) && isPathClear(fromR, fromC, toR, toC, testBoard);
    if (type === 'b') return absDr === absDc && isPathClear(fromR, fromC, toR, toC, testBoard);
    if (type === 'q') return (dr === 0 || dc === 0 || absDr === absDc) && isPathClear(fromR, fromC, toR, toC, testBoard);
    if (type === 'n') return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
    if (type === 'k') return absDr <= 1 && absDc <= 1;
    return false;
  };

  const isSquareAttacked = (r, c, attackerIsWhite, testBoard) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const piece = testBoard[i][j]; if (!piece) continue;
      if ((piece === piece.toUpperCase()) === attackerIsWhite && isValidMoveLogic(piece, i, j, r, c, true, testBoard)) return true;
    }
    return false;
  };

  const isKingInCheck = (isWhite, testBoard) => {
    let kingR = -1, kingC = -1; const kingChar = isWhite ? 'K' : 'k';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (testBoard[i][j] === kingChar) { kingR = i; kingC = j; break; }
    if (kingR === -1) return false; 
    return isSquareAttacked(kingR, kingC, !isWhite, testBoard);
  };

  const getAllValidMoves = (isWhite, currentBoard) => {
    let moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const piece = currentBoard[r][c];
      if (!piece || (piece === piece.toUpperCase()) !== isWhite) continue;
      for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
        const target = currentBoard[tr][tc];
        if (target && (target === target.toUpperCase()) === isWhite) continue; 
        if (isValidMoveLogic(piece, r, c, tr, tc, !!target, currentBoard)) {
          const tempBoard = currentBoard.map(row => [...row]);
          tempBoard[tr][tc] = piece; tempBoard[r][c] = '';
          if (!isKingInCheck(isWhite, tempBoard)) moves.push({ from: {r, c}, to: {r: tr, c: tc}, capture: !!target });
        }
      }
    }
    return moves;
  };

  const executeMove = async (newBoard, nextTurn) => {
    setBoard(newBoard); setSelectedPiece(null); setTurn(nextTurn);
    const isNextWhite = nextTurn === 'w';
    const nextValidMoves = getAllValidMoves(isNextWhite, newBoard);
    const inCheck = isKingInCheck(isNextWhite, newBoard);
    let newStatus = '';
    if (nextValidMoves.length === 0) newStatus = (inCheck ? 'Checkmate!' : 'Stalemate!');
    else newStatus = (inCheck ? 'Check!' : '');
    
    setGameStatus(newStatus);

    if (mode.startsWith('online')) {
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
            state: { board: JSON.stringify(newBoard), turn: nextTurn, gameStatus: newStatus, wTime, bTime }
        }).catch(e => console.error("Chess sync error:", e));
    }
  };

  const handleSquareClick = (r, c) => {
    if (gameStatus.includes('mate') || gameStatus.includes('Timeout') || (mode === 'pvai' && turn === 'b')) return;
    if (mode === 'online-host' && turn !== 'w') return;
    if (mode === 'online-client' && turn !== 'b') return;

    const piece = board[r][c];
    if (selectedPiece === null) {
      if (piece && ((turn === 'w' && piece === piece.toUpperCase()) || (turn === 'b' && piece === piece.toLowerCase()))) setSelectedPiece({ r, c });
    } else {
      const targetPiece = board[r][c];
      const targetIsWhite = targetPiece !== '' && targetPiece === targetPiece.toUpperCase();
      const targetIsBlack = targetPiece !== '' && targetPiece === targetPiece.toLowerCase();

      if ((turn === 'w' && targetIsWhite) || (turn === 'b' && targetIsBlack)) {
        if (r === selectedPiece.r && c === selectedPiece.c) setSelectedPiece(null); else setSelectedPiece({ r, c });
        return;
      }
      
      let pieceToMove = board[selectedPiece.r][selectedPiece.c];
      if (!isValidMoveLogic(pieceToMove, selectedPiece.r, selectedPiece.c, r, c, !!targetPiece, board)) { setSelectedPiece(null); return; }
      
      const tempBoard = board.map(row => [...row]);
      if (pieceToMove === 'P' && r === 0) pieceToMove = 'Q';
      if (pieceToMove === 'p' && r === 7) pieceToMove = 'q';
      
      tempBoard[r][c] = pieceToMove;
      tempBoard[selectedPiece.r][selectedPiece.c] = '';
      if (isKingInCheck(turn === 'w', tempBoard)) { setSelectedPiece(null); return; }
      executeMove(tempBoard, turn === 'w' ? 'b' : 'w');
    }
  };

  useEffect(() => {
    if (mode === 'pvai' && turn === 'b' && !gameStatus.includes('mate') && !gameStatus.includes('Timeout')) {
      const timer = setTimeout(() => {
        const validMoves = getAllValidMoves(false, board);
        if (validMoves.length > 0) {
          let chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
          if (settings.difficulty !== 'easy') {
            const captures = validMoves.filter(m => m.capture);
            if (captures.length > 0) chosenMove = captures[Math.floor(Math.random() * captures.length)];
          }
          const newBoard = board.map(row => [...row]);
          let pieceToMove = newBoard[chosenMove.from.r][chosenMove.from.c];
          
          if (pieceToMove === 'p' && chosenMove.to.r === 7) pieceToMove = 'q';
          
          newBoard[chosenMove.to.r][chosenMove.to.c] = pieceToMove;
          newBoard[chosenMove.from.r][chosenMove.from.c] = '';
          executeMove(newBoard, 'w');
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [turn, board, mode, settings.difficulty, gameStatus]);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
       <div className="w-full mb-6 flex items-center justify-between">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Chess {mode === 'pvai' ? 'vs AI' : 'PvP'}</h2>
          <p className="text-sm font-medium">
            {gameStatus ? <span className="text-red-400 font-bold animate-pulse">{gameStatus}</span> : <span className="text-slate-400">{turn === 'w' ? "White's Turn" : "Black's Turn"}</span>}
          </p>
        </div>
        <div className="flex gap-4 font-mono">
            <div className={`px-3 py-1 rounded bg-slate-800 border ${turn === 'w' ? 'border-emerald-500' : 'border-slate-700'}`}>{formatTime(wTime)}</div>
            <div className={`px-3 py-1 rounded bg-slate-800 border ${turn === 'b' ? 'border-indigo-500' : 'border-slate-700'}`}>{formatTime(bTime)}</div>
        </div>
      </div>
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
        <div className="grid grid-cols-8 border-4 border-slate-900 rounded-lg overflow-hidden">
          {board.map((row, r) => row.map((piece, c) => {
            const isWhitePiece = piece && piece === piece.toUpperCase();
            return (
                <div key={`${r}-${c}`} onClick={() => handleSquareClick(r, c)} className={`w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center text-3xl sm:text-4xl cursor-pointer select-none transition-colors ${(r + c) % 2 === 1 ? 'bg-slate-600' : 'bg-slate-300'} ${selectedPiece?.r === r && selectedPiece?.c === c ? 'ring-4 ring-indigo-500 ring-inset bg-indigo-300' : ''}`}>
                {piece && (
                    <span style={{ color: 'black', filter: isWhitePiece ? 'brightness(0) invert(1) drop-shadow(0px -2px 2px rgba(0,0,0,0.8))' : 'drop-shadow(0px 2px 2px rgba(255,255,255,0.4))', display: 'inline-block' }}>
                        {pieceSymbols[piece] + '\uFE0E'}
                    </span>
                )}
                </div>
            )
          }))}
        </div>
      </div>
    </div>
  );
}

// --- SOLITAIRE GAME ---
function SolitaireGame({ navigate }) {
  const [deck, setDeck] = useState([]);
  const [waste, setWaste] = useState([]); 
  const [tableau, setTableau] = useState([[], [], [], [], [], [], []]);
  const [foundations, setFoundations] = useState([[], [], [], []]); 

  useEffect(() => {
    const suits = ['♠', '♥', '♣', '♦']; const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    suits.forEach(s => values.forEach(v => newDeck.push({ suit: s, val: v, color: (s==='♥'||s==='♦') ? 'red' : 'black' })));
    newDeck.sort(() => Math.random() - 0.5);
    let newTableau = [[], [], [], [], [], [], []];
    for(let i=0; i<7; i++) for(let j=0; j<=i; j++) newTableau[i].push({...newDeck.pop(), faceUp: j === i});
    setDeck(newDeck); setTableau(newTableau);
  }, []);

  const drawCard = () => {
      if (deck.length > 0) {
          const newDeck = [...deck];
          const drawn = {...newDeck.pop(), faceUp: true}; 
          setWaste(prev => [...prev, drawn]);
          setDeck(newDeck);
      } else if (waste.length > 0) {
          setDeck([...waste].reverse().map(c => ({...c, faceUp: false})));
          setWaste([]);
      }
  };

  const handleDragStart = (e, sourceData) => { e.dataTransfer.setData('text/plain', JSON.stringify(sourceData)); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDropOnTableau = (e, targetPileIdx) => {
    e.preventDefault(); const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    let sourceCard, cardsToMove = [];
    if (data.source === 'waste') { sourceCard = waste[waste.length - 1]; cardsToMove = [sourceCard]; }
    else if (data.source === 'tableau') { sourceCard = tableau[data.pileIdx][data.cardIdx]; cardsToMove = tableau[data.pileIdx].slice(data.cardIdx); }
    else if (data.source === 'foundation') { sourceCard = foundations[data.pileIdx][foundations[data.pileIdx].length - 1]; cardsToMove = [sourceCard]; }

    if (!sourceCard) return;
    const targetPile = tableau[targetPileIdx]; const targetCard = targetPile.length > 0 ? targetPile[targetPile.length - 1] : null;
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    let validMove = false;
    if (!targetCard) validMove = sourceCard.val === 'K';
    else validMove = sourceCard.color !== targetCard.color && values.indexOf(sourceCard.val) === values.indexOf(targetCard.val) - 1;

    if (validMove) {
        const newTableau = [...tableau];
        if (data.source === 'waste') { 
            const newWaste = [...waste]; newWaste.pop(); setWaste(newWaste); 
        }
        else if (data.source === 'tableau') {
            newTableau[data.pileIdx] = newTableau[data.pileIdx].slice(0, data.cardIdx);
            if (newTableau[data.pileIdx].length > 0) {
               const topIdx = newTableau[data.pileIdx].length - 1;
               newTableau[data.pileIdx][topIdx] = { ...newTableau[data.pileIdx][topIdx], faceUp: true };
            }
        } else if (data.source === 'foundation') {
            const newFoundations = [...foundations]; newFoundations[data.pileIdx].pop(); setFoundations(newFoundations);
        }
        
        cardsToMove = cardsToMove.map(c => ({...c, faceUp: true}));
        newTableau[targetPileIdx] = [...newTableau[targetPileIdx], ...cardsToMove];
        setTableau(newTableau);
    }
  };

  const handleDropOnFoundation = (e, targetPileIdx) => {
    e.preventDefault(); const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    let sourceCard;
    if (data.source === 'waste') sourceCard = waste[waste.length - 1];
    else if (data.source === 'tableau' && data.cardIdx === tableau[data.pileIdx].length - 1) sourceCard = tableau[data.pileIdx][data.cardIdx];
    else return;

    const targetPile = foundations[targetPileIdx]; const targetCard = targetPile.length > 0 ? targetPile[targetPile.length - 1] : null;
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let validMove = false;
    if (!targetCard) validMove = sourceCard.val === 'A';
    else validMove = sourceCard.suit === targetCard.suit && values.indexOf(sourceCard.val) === values.indexOf(targetCard.val) + 1;

    if (validMove) {
        const newFoundations = [...foundations]; newFoundations[targetPileIdx].push({...sourceCard, faceUp: true});
        if (data.source === 'waste') { 
            const newWaste = [...waste]; newWaste.pop(); setWaste(newWaste); 
        }
        else if (data.source === 'tableau') {
            const newTableau = [...tableau]; newTableau[data.pileIdx].pop();
            if (newTableau[data.pileIdx].length > 0) {
                const topIdx = newTableau[data.pileIdx].length - 1;
                newTableau[data.pileIdx][topIdx] = { ...newTableau[data.pileIdx][topIdx], faceUp: true };
            }
            setTableau(newTableau);
        }
        setFoundations(newFoundations);
    }
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h2 className="text-2xl font-bold text-white">Solitaire</h2>
      </div>
      <div className="bg-[#065f46] p-8 rounded-2xl border border-slate-700 shadow-2xl min-h-[600px] overflow-x-auto select-none">
        <div className="flex gap-4 mb-8 min-w-max">
            <div onClick={drawCard} className="w-20 h-28 border-2 border-dashed border-emerald-400/50 rounded-lg flex items-center justify-center cursor-pointer hover:bg-emerald-800/30">
                {deck.length > 0 ? <div className="w-full h-full bg-slate-800 rounded-lg border-2 border-white flex items-center justify-center text-indigo-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]"><Club /></div> : <span className="text-emerald-400/50 text-xs">♻️</span>}
            </div>
            {waste.length > 0 ? (
                <div draggable onDragStart={(e) => handleDragStart(e, {source: 'waste'})} className={`w-20 h-28 bg-white rounded-lg border-2 border-slate-300 shadow-lg flex flex-col items-center justify-center cursor-grab active:cursor-grabbing ${waste[waste.length-1].color === 'red' ? 'text-red-500' : 'text-slate-900'}`}>
                    <span className="text-xl font-bold">{waste[waste.length-1].val}</span><span className="text-2xl">{waste[waste.length-1].suit}</span>
                </div>
            ) : <div className="w-20 h-28"></div>}
            <div className="flex-1"></div>
            {foundations.map((pile, pIdx) => (
                 <div key={`f-${pIdx}`} onDragOver={handleDragOver} onDrop={(e) => handleDropOnFoundation(e, pIdx)} className="w-20 h-28 border-2 border-dashed border-emerald-400/50 rounded-lg flex flex-col items-center justify-center relative bg-emerald-800/20">
                     {pile.length === 0 ? <span className="text-emerald-400/30 font-bold text-xl">A</span> : 
                        <div draggable onDragStart={(e) => handleDragStart(e, {source: 'foundation', pileIdx: pIdx})} className={`absolute inset-0 bg-white rounded-lg border-2 border-slate-300 shadow-lg flex flex-col items-center justify-center cursor-grab ${pile[pile.length-1].color === 'red' ? 'text-red-500' : 'text-slate-900'}`}>
                            <span className="text-xl font-bold">{pile[pile.length-1].val}</span><span className="text-2xl">{pile[pile.length-1].suit}</span>
                        </div>
                     }
                 </div>
            ))}
        </div>
        <div className="flex gap-4 min-w-max">
            {tableau.map((pile, pIdx) => (
                <div key={`pile-${pIdx}`} onDragOver={handleDragOver} onDrop={(e) => handleDropOnTableau(e, pIdx)} className="w-20 min-h-[112px] relative">
                    {pile.length === 0 && <div className="absolute inset-0 border-2 border-dashed border-emerald-400/30 rounded-lg h-28"></div>}
                    {pile.map((card, cIdx) => (
                        <div key={`c-${pIdx}-${cIdx}`} draggable={card.faceUp} onDragStart={(e) => handleDragStart(e, {source: 'tableau', pileIdx: pIdx, cardIdx: cIdx})} className={`absolute w-full h-28 rounded-lg shadow-md border-2 ${!card.faceUp ? 'bg-slate-800 border-white text-indigo-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]' : 'bg-white'} ${card.faceUp && card.color === 'red' ? 'text-red-500' : 'text-slate-900'} ${card.faceUp ? 'border-slate-300 cursor-grab active:cursor-grabbing' : ''}`} style={{ top: `${cIdx * 24}px` }}>
                            {card.faceUp && <div className="p-1 flex flex-col items-start h-full leading-none"><span className="font-bold">{card.val}</span><span>{card.suit}</span></div>}
                        </div>
                    ))}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// --- FOOSBALL GAME ---
function FoosballGame({ navigate, mode, settings }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (winner) return;
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    let animationId;
    const W = 800, H = 400; const GOAL_H = 120; const GOAL_Y = (H - GOAL_H) / 2; const PADDLE_W = 14, PADDLE_H = 40;
    let ball = { x: W/2, y: H/2, vx: 4, vy: 2, radius: 8 }; let keys = {};
    let p1Rows = [{ x: 50, yOffset: 0, players: [0] }, { x: 200, yOffset: 0, players: [-80, 80] }, { x: 500, yOffset: 0, players: [-120, 0, 120] }];
    let p2Rows = [{ x: 750, yOffset: 0, players: [0] }, { x: 600, yOffset: 0, players: [-80, 80] }, { x: 300, yOffset: 0, players: [-120, 0, 120] }];
    let p1KickTimer = 0; let p2KickTimer = 0;

    const handleKeyDown = (e) => { keys[e.code] = true; }; const handleKeyUp = (e) => { keys[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);

    const resetBall = (direction) => { ball = { x: W/2, y: H/2, vx: 10 * direction, vy: (Math.random() - 0.5) * 8, radius: 8 }; };

    const checkWin = (s) => {
        if (s.p1 >= 5) setWinner("Player 1");
        else if (s.p2 >= 5) setWinner(mode === 'pvai' ? "Computer" : "Player 2");
    }

    const update = () => {
        const speed = 6;
        if (keys['KeyW']) p1Rows.forEach(r => r.yOffset = Math.max(-100, r.yOffset - speed));
        if (keys['KeyS']) p1Rows.forEach(r => r.yOffset = Math.min(100, r.yOffset + speed));
        if (keys['Space']) p1KickTimer = 10;
        
        if (mode === 'pvp') {
            if (keys['ArrowUp']) p2Rows.forEach(r => r.yOffset = Math.max(-100, r.yOffset - speed));
            if (keys['ArrowDown']) p2Rows.forEach(r => r.yOffset = Math.min(100, r.yOffset + speed));
            if (keys['Enter']) p2KickTimer = 10;
        } else {
            const targetYOffset = ball.y - H/2;
            p2Rows.forEach(r => {
                if (r.yOffset < targetYOffset - 10) r.yOffset += speed * 0.7; if (r.yOffset > targetYOffset + 10) r.yOffset -= speed * 0.7;
                r.yOffset = Math.max(-100, Math.min(100, r.yOffset));
            });
            if (ball.vx > 0 && Math.abs(ball.vx) < 10) p2Rows.forEach(r => { if (Math.abs(ball.x - r.x) < 30) p2KickTimer = 10; });
        }

        if (p1KickTimer > 0) p1KickTimer--; if (p2KickTimer > 0) p2KickTimer--;

        ball.vx *= 0.998; ball.vy *= 0.998; ball.x += ball.vx; ball.y += ball.vy;
        
        if (Math.abs(ball.vx) < 0.5 && Math.abs(ball.vy) < 0.5) {
            ball.vx += ball.x > W/2 ? 0.08 : -0.08;
            if (ball.y < 50) ball.vy += 0.1;
            else if (ball.y > H - 50) ball.vy -= 0.1;
            else ball.vy += (Math.random() - 0.5) * 0.1;
        }

        if (ball.y <= ball.radius) { ball.vy = Math.abs(ball.vy); ball.y = ball.radius + 1; }
        if (ball.y >= H - ball.radius) { ball.vy = -Math.abs(ball.vy); ball.y = H - ball.radius - 1; }
        
        if (ball.x < 0) { if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) { setScore(s => { const ns = {...s, p2: s.p2 + 1}; checkWin(ns); return ns;}); resetBall(-1); } else { ball.vx = Math.abs(ball.vx); ball.x = ball.radius + 1; } }
        if (ball.x > W) { if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) { setScore(s => { const ns = {...s, p1: s.p1 + 1}; checkWin(ns); return ns;}); resetBall(1); } else { ball.vx = -Math.abs(ball.vx); ball.x = W - ball.radius - 1; } }

        const checkCollisions = (rows, isP1) => {
            rows.forEach(row => { row.players.forEach(pY => {
                const paddleY = H/2 + pY + row.yOffset;
                const pTop = paddleY - PADDLE_H/2; const pBot = paddleY + PADDLE_H/2;
                const pLeft = row.x - PADDLE_W/2; const pRight = row.x + PADDLE_W/2;
                if (ball.x + ball.radius > pLeft && ball.x - ball.radius < pRight && ball.y + ball.radius > pTop && ball.y - ball.radius < pBot) {
                    ball.vx *= -1.1;
                    if (isP1 && p1KickTimer > 0) ball.vx = 12; if (!isP1 && p2KickTimer > 0) ball.vx = -12;
                    ball.x = isP1 ? pRight + ball.radius : pLeft - ball.radius;
                    ball.vy += (ball.y - paddleY) * 0.1;
                }
            });});
        };
        
        if (ball.vx < 0) checkCollisions(p1Rows, true); if (ball.vx > 0) checkCollisions(p2Rows, false);
        
        const currentSpeed = Math.sqrt(ball.vx**2 + ball.vy**2);
        const maxSpeed = 16;
        if (currentSpeed > maxSpeed) { ball.vx = (ball.vx / currentSpeed) * maxSpeed; ball.vy = (ball.vy / currentSpeed) * maxSpeed; }
    };

    const draw = () => {
        ctx.fillStyle = '#065f46'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke(); ctx.beginPath(); ctx.arc(W/2, H/2, 50, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, GOAL_Y, 20, GOAL_H); ctx.fillRect(W-20, GOAL_Y, 20, GOAL_H);

        const drawRows = (rows, color, kickTimer) => {
            rows.forEach(row => {
                ctx.fillStyle = '#94a3b8'; ctx.fillRect(row.x - 3, 0, 6, H);
                row.players.forEach(pY => {
                    const paddleY = H/2 + pY + row.yOffset; ctx.fillStyle = color;
                    const width = kickTimer > 0 ? PADDLE_W + 6 : PADDLE_W; const xOffset = kickTimer > 0 ? 3 : 0;
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(row.x - width/2 + 4, paddleY - PADDLE_H/2 + 4, width, PADDLE_H);
                    ctx.fillStyle = color; ctx.fillRect(row.x - width/2 + (color==='#ef4444'? xOffset : -xOffset), paddleY - PADDLE_H/2, width, PADDLE_H);
                });
            });
        };
        drawRows(p1Rows, '#ef4444', p1KickTimer); drawRows(p2Rows, '#3b82f6', p2KickTimer);
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius-3, 0, Math.PI*2); ctx.fill();
    };

    const loop = () => { update(); draw(); animationId = requestAnimationFrame(loop); }; loop();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [mode, winner]);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Table Foosball</h2>
          <div className="flex items-center justify-center gap-4 mt-2 font-mono text-xl">
             <span className="text-red-400 font-bold">P1: {score.p1}/5</span><span className="text-slate-500">-</span><span className="text-blue-400 font-bold">{mode === 'pvai' ? 'AI' : 'P2'}: {score.p2}/5</span>
          </div>
        </div>
        <div className="w-24"></div>
      </div>
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center">
        <div className="flex gap-8 mb-4 text-sm text-slate-400">
            <p><strong className="text-red-400">P1 Controls:</strong> W / S to Move | Space to Kick</p>
            {mode === 'pvp' && <p><strong className="text-blue-400">P2 Controls:</strong> Up / Down to Move | Enter to Kick</p>}
        </div>
        <div className="w-full max-w-[800px] aspect-[2/1] bg-black rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-8 border-amber-900 relative">
           <canvas ref={canvasRef} width={800} height={400} className="w-full h-full block" />
           {winner && (
               <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                   <h2 className="text-5xl font-bold text-amber-400 mb-4">{winner} Wins!</h2>
                   <button onClick={() => { setScore({p1:0,p2:0}); setWinner(null); }} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold">Play Again</button>
               </div>
           )}
        </div>
      </div>
    </div>
  );
}

// --- PONG GAME ---
function PongGame({ navigate, mode, settings, roomId }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [winner, setWinner] = useState(null);
  
  const netState = useRef({ p1Y: 160, p2Y: 160, ball: { x: 400, y: 200, vx: -6, vy: 4, radius: 8 }, score: { p1: 0, p2: 0 }, winner: null });
  const syncRef = useRef(0);

  useEffect(() => {
      if (!roomId || !mode.startsWith('online')) return;
      const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), (snap) => {
          if (snap.exists() && snap.data().state) {
              const st = snap.data().state;
              if (mode === 'online-host') {
                  if (st.p2Y !== undefined) netState.current.p2Y = st.p2Y;
              } else {
                  if (st.p1Y !== undefined) netState.current.p1Y = st.p1Y;
                  if (st.ball) netState.current.ball = st.ball;
                  if (st.score) {
                      netState.current.score = st.score;
                      setScore(st.score);
                  }
                  if (st.winner) {
                      netState.current.winner = st.winner;
                      setWinner(st.winner);
                  }
              }
          }
      });
      return () => unsub();
  }, [roomId, mode]);

  useEffect(() => {
    if (winner) return;
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    let animationId;
    const W = 800, H = 400; const PADDLE_W = 10, PADDLE_H = 80;
    let ball = mode === 'online-client' ? netState.current.ball : { x: W/2, y: H/2, vx: -6, vy: 4, radius: 8 };
    let p1Y = mode === 'online-client' ? netState.current.p1Y : H/2 - PADDLE_H/2; 
    let p2Y = H/2 - PADDLE_H/2;
    let keys = {};
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    const checkWin = (s) => {
        if (s.p1 >= 5) setWinner("Player 1");
        else if (s.p2 >= 5) setWinner(mode === 'pvai' ? "Computer" : "Player 2");
    }

    const update = () => {
        const isHost = mode === 'online-host' || !mode.startsWith('online');
        const isClient = mode === 'online-client';

        if (isHost || mode === 'pvp') {
            if (keys['KeyW']) p1Y = Math.max(0, p1Y - 8);
            if (keys['KeyS']) p1Y = Math.min(H - PADDLE_H, p1Y + 8);
        } else if (isClient) {
            p1Y = netState.current.p1Y;
        }
        
        if (mode === 'pvp') {
            if (keys['ArrowUp']) p2Y = Math.max(0, p2Y - 8);
            if (keys['ArrowDown']) p2Y = Math.min(H - PADDLE_H, p2Y + 8);
        } else if (isClient) {
            if (keys['ArrowUp'] || keys['KeyW']) p2Y = Math.max(0, p2Y - 8);
            if (keys['ArrowDown'] || keys['KeyS']) p2Y = Math.min(H - PADDLE_H, p2Y + 8);
        } else if (isHost && mode.startsWith('online')) {
            p2Y = netState.current.p2Y;
        } else {
            const speed = settings.difficulty === 'hard' ? 7 : settings.difficulty === 'medium' ? 5 : 3;
            if (p2Y + PADDLE_H/2 < ball.y - 10) p2Y += speed;
            if (p2Y + PADDLE_H/2 > ball.y + 10) p2Y -= speed;
            p2Y = Math.max(0, Math.min(H - PADDLE_H, p2Y));
        }

        if (isHost) {
            ball.x += ball.vx; ball.y += ball.vy;

            if (ball.y < ball.radius || ball.y > H - ball.radius) ball.vy *= -1;
            if (ball.x < 0) { setScore(s => { const ns = {...s, p2: s.p2 + 1}; checkWin(ns); return ns;}); ball = {x: W/2, y: H/2, vx: 6, vy: 4, radius: 8}; }
            if (ball.x > W) { setScore(s => { const ns = {...s, p1: s.p1 + 1}; checkWin(ns); return ns;}); ball = {x: W/2, y: H/2, vx: -6, vy: -4, radius: 8}; }

            if (ball.vx < 0 && ball.x - ball.radius < 40 + PADDLE_W && ball.y > p1Y && ball.y < p1Y + PADDLE_H) {
                ball.vx *= -1.1; ball.x = 40 + PADDLE_W + ball.radius; ball.vy += (ball.y - (p1Y + PADDLE_H/2)) * 0.1;
            }
            if (ball.vx > 0 && ball.x + ball.radius > W - 40 - PADDLE_W && ball.y > p2Y && ball.y < p2Y + PADDLE_H) {
                ball.vx *= -1.1; ball.x = W - 40 - PADDLE_W - ball.radius; ball.vy += (ball.y - (p2Y + PADDLE_H/2)) * 0.1;
            }
        } else {
            ball = netState.current.ball;
        }
        
        if (mode.startsWith('online')) {
            if (Date.now() - syncRef.current > 50) { 
               if (isHost) {
                   updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                       'state.p1Y': p1Y, 'state.ball': ball, 'state.score': score, 'state.winner': winner, 'state.p2Y': p2Y
                   }).catch(()=>{});
               } else {
                   updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                       'state.p2Y': p2Y
                   }).catch(()=>{});
               }
               syncRef.current = Date.now();
            }
        }
    };

    const draw = () => {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.setLineDash([10, 15]); ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillRect(40, p1Y, PADDLE_W, PADDLE_H);
        ctx.fillRect(W - 40 - PADDLE_W, p2Y, PADDLE_W, PADDLE_H);
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2); ctx.fill();
        
        ctx.font = 'bold 48px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(score.p1, W/4, 60); ctx.fillText(score.p2, 3*W/4 - 20, 60);
    };

    const loop = () => { update(); draw(); animationId = requestAnimationFrame(loop); }; loop();
    return () => cancelAnimationFrame(animationId);
  }, [mode, score, winner, settings.difficulty]);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h2 className="text-2xl font-bold text-white tracking-widest uppercase">Pong</h2>
        <div className="w-24"></div>
      </div>
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center">
        <div className="flex gap-8 mb-4 text-sm text-slate-400">
            <p><strong>P1:</strong> W / S</p>{mode === 'pvp' && <p><strong>P2:</strong> Up / Down</p>}
            {mode.startsWith('online') && <p className="text-indigo-400"><strong>Online Match</strong></p>}
        </div>
        <div className="w-full max-w-[800px] aspect-[2/1] bg-slate-900 rounded-lg overflow-hidden border-4 border-indigo-500/30 relative">
           <canvas ref={canvasRef} width={800} height={400} className="w-full h-full block" />
           {winner && (
               <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                   <h2 className="text-5xl font-bold text-indigo-400 mb-4">{winner} Wins!</h2>
                   <button onClick={() => { 
                       setScore({p1:0,p2:0}); setWinner(null); 
                       if (mode === 'online-host') {
                           updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                               'state.score': {p1:0, p2:0}, 'state.winner': null
                           }).catch(()=>{});
                       }
                   }} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold">Play Again</button>
               </div>
           )}
        </div>
      </div>
    </div>
  );
}

// --- AIR HOCKEY GAME ---
function AirHockeyGame({ navigate, mode }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (winner) return;
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    let animationId; const W = 800, H = 400, GOAL_H = 140, MALLET_R = 25, PUCK_R = 15;
    let puck = { x: W/2, y: H/2, vx: 0, vy: 0 };
    let p1 = { x: W/4, y: H/2 }; let p2 = { x: 3*W/4, y: H/2 };
    
    let mouse = { x: W/4, y: H/2 };
    const getMouse = (e) => { const rect = canvas.getBoundingClientRect(); mouse = { x: (e.clientX - rect.left) * (W/rect.width), y: (e.clientY - rect.top) * (H/rect.height) }; };
    canvas.addEventListener('mousemove', getMouse);

    const checkWin = (s) => {
        if (s.p1 >= 5) setWinner("Player 1");
        else if (s.p2 >= 5) setWinner(mode === 'pvai' ? "Computer" : "Player 2");
    }

    const checkCollision = (m) => {
        const dx = puck.x - m.x; const dy = puck.y - m.y; const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < MALLET_R + PUCK_R) {
            const angle = Math.atan2(dy, dx);
            const speed = Math.sqrt(puck.vx*puck.vx + puck.vy*puck.vy);
            const newSpeed = Math.min(20, speed + 5); 
            puck.vx = Math.cos(angle) * newSpeed; puck.vy = Math.sin(angle) * newSpeed;
            puck.x = m.x + Math.cos(angle) * (MALLET_R + PUCK_R + 1);
            puck.y = m.y + Math.sin(angle) * (MALLET_R + PUCK_R + 1);
        }
    };

    const update = () => {
        p1.x += (Math.max(MALLET_R, Math.min(W/2 - MALLET_R, mouse.x)) - p1.x) * 0.3;
        p1.y += (Math.max(MALLET_R, Math.min(H - MALLET_R, mouse.y)) - p1.y) * 0.3;

        const targetX = puck.x > W/2 ? puck.x : 3*W/4; const targetY = puck.x > W/2 ? puck.y : H/2;
        p2.x += (Math.max(W/2 + MALLET_R, Math.min(W - MALLET_R, targetX)) - p2.x) * 0.1;
        p2.y += (Math.max(MALLET_R, Math.min(H - MALLET_R, targetY)) - p2.y) * 0.1;

        puck.vx *= 0.99; puck.vy *= 0.99; puck.x += puck.vx; puck.y += puck.vy;

        if (puck.y < PUCK_R || puck.y > H - PUCK_R) { puck.vy *= -1; puck.y = puck.y < PUCK_R ? PUCK_R : H - PUCK_R; }
        if (puck.x < PUCK_R) {
            if (puck.y > (H-GOAL_H)/2 && puck.y < (H+GOAL_H)/2) { setScore(s => { const ns = {...s, p2: s.p2+1}; checkWin(ns); return ns;}); puck = {x:W/2, y:H/2, vx:0, vy:0}; }
            else { puck.vx *= -1; puck.x = PUCK_R; }
        }
        if (puck.x > W - PUCK_R) {
            if (puck.y > (H-GOAL_H)/2 && puck.y < (H+GOAL_H)/2) { setScore(s => { const ns = {...s, p1: s.p1+1}; checkWin(ns); return ns;}); puck = {x:W/2, y:H/2, vx:0, vy:0}; }
            else { puck.vx *= -1; puck.x = W - PUCK_R; }
        }

        checkCollision(p1); checkCollision(p2);
    };

    const draw = () => {
        ctx.fillStyle = '#e0f2fe'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
        ctx.beginPath(); ctx.arc(W/2, H/2, 50, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, H/2, GOAL_H/2, -Math.PI/2, Math.PI/2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W, H/2, GOAL_H/2, Math.PI/2, -Math.PI/2); ctx.stroke();
        
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(p1.x, p1.y, MALLET_R, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(p2.x, p2.y, MALLET_R, 0, Math.PI*2); ctx.fill();
    };

    const loop = () => { update(); draw(); animationId = requestAnimationFrame(loop); }; loop();
    return () => { cancelAnimationFrame(animationId); canvas.removeEventListener('mousemove', getMouse); };
  }, [score, winner]);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h2 className="text-2xl font-bold text-white">Air Hockey</h2>
        <div className="w-24 text-right font-bold text-xl"><span className="text-blue-400">{score.p1}</span> - <span className="text-red-400">{score.p2}</span></div>
      </div>
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center">
        <div className="w-full max-w-[800px] aspect-[2/1] bg-black rounded-3xl overflow-hidden border-8 border-slate-700 relative">
           <canvas ref={canvasRef} width={800} height={400} className="w-full h-full block cursor-none" />
           {winner && (
               <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                   <h2 className="text-5xl font-bold text-cyan-400 mb-4">{winner} Wins!</h2>
                   <button onClick={() => { setScore({p1:0,p2:0}); setWinner(null); }} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold">Play Again</button>
               </div>
           )}
        </div>
      </div>
    </div>
  );
}

// --- CONNECT 4 ---
function Connect4Game({ navigate, mode, roomId }) {
    const [board, setBoard] = useState(Array(6).fill(null).map(() => Array(7).fill(null)));
    const [turn, setTurn] = useState('Red');
    const [winner, setWinner] = useState(null);

    useEffect(() => {
        if (!roomId || !mode.startsWith('online')) return;
        const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), (snap) => {
            if (snap.exists() && snap.data().state) {
                const st = snap.data().state;
                // FIX: JSON Parse the nested 2D array to bypass Firebase rules securely
                if (st.board) setBoard(typeof st.board === 'string' ? JSON.parse(st.board) : st.board);
                setTurn(st.turn);
                setWinner(st.winner);
            }
        });
        return () => unsub();
    }, [roomId, mode]);

    const checkWin = (b, r, c, player) => {
        const dirs = [[0,1], [1,0], [1,1], [1,-1]];
        for (let [dr, dc] of dirs) {
            let count = 1;
            for (let i=1; i<4; i++) { if (b[r+dr*i] && b[r+dr*i][c+dc*i] === player) count++; else break; }
            for (let i=1; i<4; i++) { if (b[r-dr*i] && b[r-dr*i][c-dc*i] === player) count++; else break; }
            if (count >= 4) return true;
        }
        return false;
    };

    const dropToken = async (col) => {
        if (winner || (mode === 'pvai' && turn === 'Yellow')) return;
        
        if (mode === 'online-host' && turn !== 'Red') return;
        if (mode === 'online-client' && turn !== 'Yellow') return;

        let newBoard = board.map(row => [...row]);
        for (let r = 5; r >= 0; r--) {
            if (!newBoard[r][col]) {
                newBoard[r][col] = turn;
                const isWin = checkWin(newBoard, r, col, turn);
                const nextTurn = isWin ? turn : (turn === 'Red' ? 'Yellow' : 'Red');
                const nextWinner = isWin ? turn : null;
                
                if (isWin) setWinner(turn);
                else setTurn(nextTurn);
                setBoard(newBoard);
                
                if (mode.startsWith('online')) {
                    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                        state: { board: JSON.stringify(newBoard), turn: nextTurn, winner: nextWinner || null }
                    }).catch(e => console.error("Connect4 sync error:", e));
                }
                return;
            }
        }
    };

    useEffect(() => {
        if (mode === 'pvai' && turn === 'Yellow' && !winner) {
            const timer = setTimeout(() => {
                let validCols = [];
                for(let c=0; c<7; c++) if (!board[0][c]) validCols.push(c);
                
                if (validCols.length > 0) {
                    let chosenCol = -1;
                    
                    for (let c of validCols) {
                        let tempBoard = board.map(row => [...row]);
                        for (let r = 5; r >= 0; r--) if (!tempBoard[r][c]) {
                            tempBoard[r][c] = 'Yellow';
                            if (checkWin(tempBoard, r, c, 'Yellow')) chosenCol = c;
                            break;
                        }
                    }
                    
                    if (chosenCol === -1) {
                        for (let c of validCols) {
                            let tempBoard = board.map(row => [...row]);
                            for (let r = 5; r >= 0; r--) if (!tempBoard[r][c]) {
                                tempBoard[r][c] = 'Red';
                                if (checkWin(tempBoard, r, c, 'Red')) chosenCol = c;
                                break;
                            }
                        }
                    }
                    
                    if (chosenCol === -1) chosenCol = validCols[Math.floor(Math.random() * validCols.length)];
                    
                    let newBoard = board.map(row => [...row]);
                    for (let r = 5; r >= 0; r--) {
                        if (!newBoard[r][chosenCol]) {
                            newBoard[r][chosenCol] = turn;
                            if (checkWin(newBoard, r, chosenCol, turn)) setWinner(turn);
                            else setTurn('Red');
                            setBoard(newBoard); return;
                        }
                    }
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [turn, board, mode, winner]);

    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
        <div className="w-full mb-6 flex items-center justify-between">
          <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
          <h2 className="text-2xl font-bold text-white">Connect 4</h2>
          <div className="w-24"></div>
        </div>
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl">
            <h3 className="text-center text-xl font-bold mb-6 h-8">
                {winner ? <span className="text-white bg-green-500/20 px-4 py-1 rounded-full">{winner} Wins!</span> : <span className={turn === 'Red' ? 'text-red-400' : 'text-yellow-400'}>{turn}'s Turn</span>}
            </h3>
            <div className="bg-blue-600 p-4 rounded-xl shadow-inner flex gap-2">
                {[0,1,2,3,4,5,6].map(c => (
                    <div key={c} onClick={() => dropToken(c)} className="flex flex-col gap-2 cursor-pointer group">
                        <div className="w-12 h-4 mb-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex justify-center"><div className={`w-8 h-8 rounded-full ${turn==='Red' ? 'bg-red-500':'bg-yellow-400'}`}></div></div>
                        {board.map((row, r) => (
                            <div key={r} className="w-14 h-14 bg-slate-900 rounded-full shadow-inner flex items-center justify-center border-4 border-blue-700">
                                {board[r][c] && <div className={`w-10 h-10 rounded-full shadow-md animate-in slide-in-from-top-10 ${board[r][c] === 'Red' ? 'bg-red-500' : 'bg-yellow-400'}`} />}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            {winner && <button onClick={() => {
                const emptyBoard = Array(6).fill(null).map(() => Array(7).fill(null));
                setBoard(emptyBoard); setWinner(null); setTurn('Red');
                if (mode.startsWith('online')) {
                    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_rooms', roomId), {
                        state: { board: JSON.stringify(emptyBoard), turn: 'Red', winner: null }
                    }).catch(()=>{});
                }
            }} className="mt-8 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Play Again</button>}
        </div>
      </div>
    );
}

// --- SNAKE GAME ---
function SnakeGame({ navigate }) {
    const [snake, setSnake] = useState([{x: 10, y: 10}]);
    const [apple, setApple] = useState({x: 15, y: 10});
    const [dir, setDir] = useState({x: 1, y: 0});
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);

    const dirRef = useRef(dir);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'ArrowUp' && dirRef.current.y === 0) setDir({x: 0, y: -1});
            if (e.key === 'ArrowDown' && dirRef.current.y === 0) setDir({x: 0, y: 1});
            if (e.key === 'ArrowLeft' && dirRef.current.x === 0) setDir({x: -1, y: 0});
            if (e.key === 'ArrowRight' && dirRef.current.x === 0) setDir({x: 1, y: 0});
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    useEffect(() => { dirRef.current = dir; }, [dir]);

    useEffect(() => {
        if (gameOver) return;
        const moveSnake = () => {
            setSnake(prev => {
                const head = { x: prev[0].x + dirRef.current.x, y: prev[0].y + dirRef.current.y };
                if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 || prev.some(s => s.x === head.x && s.y === head.y)) {
                    setGameOver(true); return prev;
                }
                const newSnake = [head, ...prev];
                if (head.x === apple.x && head.y === apple.y) {
                    setScore(s => s + 10);
                    setApple({ x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) });
                } else {
                    newSnake.pop();
                }
                return newSnake;
            });
        };
        const id = setInterval(moveSnake, 120);
        return () => clearInterval(id);
    }, [apple, gameOver]);

    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
        <div className="w-full mb-6 flex items-center justify-between max-w-lg">
          <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
          <h2 className="text-2xl font-bold text-white">Classic Snake</h2>
          <div className="text-emerald-400 font-mono text-xl">{score}</div>
        </div>
        <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-2xl relative">
            <div className="grid grid-cols-20 bg-slate-900 border-4 border-slate-700 rounded-lg overflow-hidden" style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}>
                {Array.from({length: 400}).map((_, i) => {
                    const x = i % 20; const y = Math.floor(i / 20);
                    const isSnake = snake.some(s => s.x === x && s.y === y);
                    const isApple = apple.x === x && apple.y === y;
                    const isHead = snake[0].x === x && snake[0].y === y;
                    return (
                        <div key={i} className={`w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 ${isHead ? 'bg-emerald-400 rounded-sm' : isSnake ? 'bg-emerald-600 rounded-sm' : isApple ? 'bg-red-500 rounded-full' : 'bg-transparent'}`} />
                    )
                })}
            </div>
            {gameOver && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-3xl">
                    <h2 className="text-4xl font-bold text-red-500 mb-2">Game Over!</h2>
                    <p className="text-slate-300 mb-6">Final Score: {score}</p>
                    <button onClick={() => {setSnake([{x:10,y:10}]); setDir({x:1,y:0}); setScore(0); setGameOver(false);}} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white">Restart</button>
                </div>
            )}
        </div>
      </div>
    );
}

// --- PAC-MAN ENGINE ---
function PacManGame({ navigate }) {
    const initialLayout = [
        "WWWWWWWWWWWWWWWWWWW",
        "W........W........W",
        "WOWW.WWW.W.WWW.WWOW",
        "W.................W",
        "W.WW.W.WWWWW.W.WW.W",
        "W....W...W...W....W",
        "WWWW.WWW.W.WWW.WWWW",
        "   W.W.......W.W   ",
        "WWWW.W.WW-WW.W.WWWW",
        ".......W   W.......",
        "WWWW.W.WWWWW.W.WWWW",
        "   W.W.......W.W   ",
        "WWWW.W.WWWWW.W.WWWW",
        "W........W........W",
        "WOWW.WWW.W.WWW.WWOW",
        "W..W.....P.....W..W",
        "WW.W.W.WWWWW.W.W.WW",
        "W....W...W...W....W",
        "W.WWWWWW.W.WWWWWW.W",
        "W.................W",
        "WWWWWWWWWWWWWWWWWWW"
    ];
    
    const [grid, setGrid] = useState(initialLayout.map(row => row.split('')));
    const [pacman, setPacman] = useState({x: 9, y: 15, dx: 0, dy: 0, nextDx: 0, nextDy: 0});
    
    const [ghosts, setGhosts] = useState([
        {id: 'red', x: 9, y: 7, color: '#ef4444', dx: 1, dy: 0, mode: 'chase', timer: 0, frightTimer: 0}, 
        {id: 'pink', x: 9, y: 9, color: '#ec4899', dx: 0, dy: -1, mode: 'house', timer: 15, frightTimer: 0}, 
        {id: 'cyan', x: 8, y: 9, color: '#06b6d4', dx: 1, dy: 0, mode: 'house', timer: 45, frightTimer: 0}, 
        {id: 'orange', x: 10, y: 9, color: '#f97316', dx: -1, dy: 0, mode: 'house', timer: 75, frightTimer: 0}, 
    ]);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [win, setWin] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowUp') setPacman(p => ({...p, nextDx: 0, nextDy: -1}));
            if (e.key === 'ArrowDown') setPacman(p => ({...p, nextDx: 0, nextDy: 1}));
            if (e.key === 'ArrowLeft') setPacman(p => ({...p, nextDx: -1, nextDy: 0}));
            if (e.key === 'ArrowRight') setPacman(p => ({...p, nextDx: 1, nextDy: 0}));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (gameOver || win) return;
        const interval = setInterval(() => {
            
            let newPacman = {...pacman};
            setPacman(p => {
                let nx = p.x + p.nextDx; let ny = p.y + p.nextDy;
                if (nx < 0) nx = 18; if (nx > 18) nx = 0; 
                
                let movedX = p.x; let movedY = p.y; let ndx = p.dx; let ndy = p.dy;
                if (ny >= 0 && ny < 21 && grid[ny][nx] !== 'W' && grid[ny][nx] !== '-') {
                    movedX = nx; movedY = ny; ndx = p.nextDx; ndy = p.nextDy;
                } else {
                    let cx = p.x + p.dx; let cy = p.y + p.dy;
                    if (cx < 0) cx = 18; if (cx > 18) cx = 0;
                    if (cy >= 0 && cy < 21 && grid[cy][cx] !== 'W' && grid[cy][cx] !== '-') {
                        movedX = cx; movedY = cy;
                    }
                }

                if (grid[movedY][movedX] === '.' || grid[movedY][movedX] === 'O') {
                    const isPower = grid[movedY][movedX] === 'O';
                    setScore(s => s + (isPower ? 50 : 10));
                    
                    if (isPower) {
                        setGhosts(gs => gs.map(g => g.mode === 'house' || g.mode === 'eaten' ? g : {...g, mode: 'frightened', frightTimer: 35}));
                    }

                    setGrid(g => {
                        const newG = g.map(r => [...r]);
                        newG[movedY][movedX] = ' ';
                        let pelletsLeft = 0;
                        newG.forEach(row => row.forEach(cell => { if (cell === '.' || cell === 'O') pelletsLeft++; }));
                        if (pelletsLeft === 0) setWin(true);
                        return newG;
                    });
                }
                
                newPacman = {...p, x: movedX, y: movedY, dx: ndx, dy: ndy};
                return newPacman;
            });

            setGhosts(gs => gs.map(g => {
                if (g.mode === 'house') {
                    if (g.timer > 0) return {...g, timer: g.timer - 1, x: 9, y: 9};
                    else return {...g, mode: 'chase', x: 9, y: 7, dx: 1, dy: 0};
                }

                let currentMode = g.mode;
                let newFrightTimer = g.frightTimer;
                if (currentMode === 'frightened') {
                    newFrightTimer -= 1;
                    if (newFrightTimer <= 0) currentMode = 'chase';
                }

                const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
                const validDirs = dirs.filter(d => {
                    if (d.x === -g.dx && d.y === -g.dy) return false;
                    let nx = g.x + d.x; let ny = g.y + d.y;
                    if (nx < 0) nx = 18; if (nx > 18) nx = 0;
                    return ny >= 0 && ny < 21 && grid[ny][nx] !== 'W' && grid[ny][nx] !== '-';
                });

                let chosenDir = validDirs[0] || {x: -g.dx, y: -g.dy};
                
                if (validDirs.length > 0) {
                    if (currentMode === 'frightened' || g.id === 'cyan' || g.id === 'orange') {
                        chosenDir = validDirs[Math.floor(Math.random() * validDirs.length)];
                    } else {
                        let targetX = newPacman.x; let targetY = newPacman.y;
                        if (g.id === 'pink') { targetX += newPacman.dx * 4; targetY += newPacman.dy * 4; }
                        
                        validDirs.sort((a,b) => {
                            const distA = Math.pow((g.x+a.x) - targetX, 2) + Math.pow((g.y+a.y) - targetY, 2);
                            const distB = Math.pow((g.x+b.x) - targetX, 2) + Math.pow((g.y+b.y) - targetY, 2);
                            return distA - distB;
                        });
                        chosenDir = validDirs[0];
                    }
                }

                let nx = g.x + chosenDir.x; let ny = g.y + chosenDir.y;
                if (nx < 0) nx = 18; if (nx > 18) nx = 0;
                return {...g, x: nx, y: ny, dx: chosenDir.x, dy: chosenDir.y, mode: currentMode, frightTimer: newFrightTimer};
            }));
        }, 180);

        return () => clearInterval(interval);
    }, [grid, gameOver, win, pacman]);

    useEffect(() => {
        const hitGhost = ghosts.find(g => g.x === pacman.x && g.y === pacman.y);
        if (hitGhost) {
            if (hitGhost.mode === 'frightened') {
                setScore(s => s + 200);
                setGhosts(gs => gs.map(g => g.id === hitGhost.id ? {...g, x: 9, y: 9, mode: 'house', timer: 20} : g));
            } else if (hitGhost.mode !== 'house' && hitGhost.mode !== 'eaten') {
                setGameOver(true);
            }
        }
    }, [pacman, ghosts]);

    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
        <div className="w-full mb-6 flex items-center justify-between max-w-lg">
          <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
          <h2 className="text-2xl font-bold text-yellow-400 tracking-widest uppercase">Pac-Man</h2>
          <div className="text-white font-bold text-xl">{score}</div>
        </div>
        
        <div className="bg-black p-4 rounded-xl border-4 border-blue-900 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
            <div className="flex flex-col">
              {grid.map((row, y) => (
                <div key={y} className="flex">
                   {row.map((cell, x) => {
                      const isPacman = pacman.x === x && pacman.y === y;
                      const ghost = ghosts.find(g => g.x === x && g.y === y);
                      return (
                         <div key={`${x}-${y}`} className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 flex items-center justify-center shrink-0">
                            {isPacman ? (
                               <div className="w-3/4 h-3/4 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
                            ) : ghost ? (
                               <div 
                                  className={`w-3/4 h-3/4 rounded-t-full rounded-b-sm shadow-[0_0_10px_rgba(255,255,255,0.2)] ${ghost.mode === 'frightened' && ghost.frightTimer < 10 && ghost.frightTimer % 2 === 0 ? 'bg-white' : ''}`} 
                                  style={{backgroundColor: ghost.mode === 'frightened' ? '#3b82f6' : ghost.color}} 
                               />
                            ) : cell === 'W' ? (
                               <div className="w-full h-full bg-blue-900 rounded-sm border border-blue-950" />
                            ) : cell === '-' ? (
                               <div className="w-full h-1 bg-pink-500/50 mt-[-10px]" />
                            ) : cell === '.' ? (
                               <div className="w-1.5 h-1.5 bg-yellow-100 rounded-full opacity-60" />
                            ) : cell === 'O' ? (
                               <div className="w-3 h-3 bg-yellow-200 rounded-full animate-pulse shadow-[0_0_10px_rgba(254,240,138,0.8)]" />
                            ) : null}
                         </div>
                      )
                   })}
                </div>
              ))}
            </div>

            {(gameOver || win) && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg">
                    <h2 className={`text-4xl font-bold mb-2 ${win ? 'text-yellow-400' : 'text-red-500'}`}>{win ? 'You Win!' : 'Game Over!'}</h2>
                    <p className="text-slate-300 mb-6">Final Score: {score}</p>
                    <button onClick={() => {
                        setGrid(initialLayout.map(row => row.split('')));
                        setPacman({x: 9, y: 15, dx: 0, dy: 0, nextDx: 0, nextDy: 0});
                        setGhosts([
                            {id: 'red', x: 9, y: 7, color: '#ef4444', dx: 1, dy: 0, mode: 'chase', timer: 0, frightTimer: 0}, 
                            {id: 'pink', x: 9, y: 9, color: '#ec4899', dx: 0, dy: -1, mode: 'house', timer: 15, frightTimer: 0}, 
                            {id: 'cyan', x: 8, y: 9, color: '#06b6d4', dx: 1, dy: 0, mode: 'house', timer: 45, frightTimer: 0}, 
                            {id: 'orange', x: 10, y: 9, color: '#f97316', dx: -1, dy: 0, mode: 'house', timer: 75, frightTimer: 0}
                        ]);
                        setScore(0); setGameOver(false); setWin(false);
                    }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white shadow-lg">Play Again</button>
                </div>
            )}
        </div>
      </div>
    );
}

// --- MINESWEEPER GAME ---
function MinesweeperGame({ navigate }) {
    const ROWS = 10; const COLS = 10; const MINES = 15;
    const [board, setBoard] = useState([]);
    const [gameOver, setGameOver] = useState(false);
    const [win, setWin] = useState(false);

    const initBoard = () => {
        let newBoard = Array(ROWS).fill(null).map(() => Array(COLS).fill(null).map(() => ({ isMine: false, isRevealed: false, isFlagged: false, neighbors: 0 })));
        let minesPlaced = 0;
        while (minesPlaced < MINES) {
            let r = Math.floor(Math.random() * ROWS); let c = Math.floor(Math.random() * COLS);
            if (!newBoard[r][c].isMine) { newBoard[r][c].isMine = true; minesPlaced++; }
        }
        for (let r=0; r<ROWS; r++) {
            for (let c=0; c<COLS; c++) {
                if (!newBoard[r][c].isMine) {
                    let count = 0;
                    for (let i=-1; i<=1; i++) for (let j=-1; j<=1; j++) {
                        if (r+i >= 0 && r+i < ROWS && c+j >= 0 && c+j < COLS && newBoard[r+i][c+j].isMine) count++;
                    }
                    newBoard[r][c].neighbors = count;
                }
            }
        }
        setBoard(newBoard); setGameOver(false); setWin(false);
    };

    useEffect(() => { initBoard(); }, []);

    const revealCell = (r, c) => {
        if (gameOver || win || board[r][c].isRevealed || board[r][c].isFlagged) return;
        let newBoard = board.map(row => row.map(cell => ({...cell})));
        
        if (newBoard[r][c].isMine) {
            newBoard.forEach(row => row.forEach(cell => { if(cell.isMine) cell.isRevealed = true; }));
            setBoard(newBoard); setGameOver(true); return;
        }

        const cascade = (row, col) => {
            if (row < 0 || row >= ROWS || col < 0 || col >= COLS || newBoard[row][col].isRevealed || newBoard[row][col].isFlagged) return;
            newBoard[row][col].isRevealed = true;
            if (newBoard[row][col].neighbors === 0) {
                for (let i=-1; i<=1; i++) for (let j=-1; j<=1; j++) cascade(row+i, col+j);
            }
        };
        cascade(r, c);
        
        let unrevealedSafe = 0;
        newBoard.forEach(row => row.forEach(cell => { if(!cell.isMine && !cell.isRevealed) unrevealedSafe++; }));
        if (unrevealedSafe === 0) setWin(true);
        
        setBoard(newBoard);
    };

    const flagCell = (e, r, c) => {
        e.preventDefault();
        if (gameOver || win || board[r][c].isRevealed) return;
        let newBoard = board.map(row => row.map(cell => ({...cell})));
        newBoard[r][c].isFlagged = !newBoard[r][c].isFlagged;
        setBoard(newBoard);
    };

    return (
        <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
            <div className="w-full mb-6 flex items-center justify-between max-w-md">
                <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg"><ArrowLeft className="w-4 h-4" /> Back</button>
                <h2 className="text-2xl font-bold text-white tracking-widest uppercase">Minesweeper</h2>
                <div className="w-24"></div>
            </div>
            
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
                <div className="grid gap-1 bg-slate-900 p-2 rounded-lg border-2 border-slate-700" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                    {board.map((row, r) => row.map((cell, c) => (
                        <div 
                            key={`${r}-${c}`} 
                            onClick={() => revealCell(r, c)} 
                            onContextMenu={(e) => flagCell(e, r, c)}
                            className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-lg cursor-pointer rounded-sm select-none transition-colors
                                ${cell.isRevealed ? (cell.isMine ? 'bg-red-500' : 'bg-slate-700 border-none') : 'bg-slate-500 hover:bg-slate-400 border-b-4 border-r-4 border-slate-600'}
                            `}
                        >
                            {cell.isRevealed ? (
                                cell.isMine ? <Bomb className="w-5 h-5 text-white" /> : (cell.neighbors > 0 ? <span className={['text-blue-400', 'text-green-400', 'text-red-400', 'text-purple-400', 'text-amber-400', 'text-cyan-400'][cell.neighbors-1] || 'text-white'}>{cell.neighbors}</span> : '')
                            ) : (
                                cell.isFlagged ? <Flag className="w-5 h-5 text-red-500 drop-shadow-md" /> : ''
                            )}
                        </div>
                    )))}
                </div>
                {(gameOver || win) && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-2xl">
                        <h2 className={`text-4xl font-bold mb-6 ${win ? 'text-emerald-400' : 'text-red-500'}`}>{win ? 'You Win!' : 'BOOM!'}</h2>
                        <button onClick={initBoard} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg">Play Again</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- SOCIAL MODAL (TABS, FRIENDS & DMs) ---
function SocialModal({ close, user, profile, setProfile, pendingInviteGame }) {
  const [activeTab, setActiveTab] = useState(pendingInviteGame ? 'friends' : 'global'); 
  const [activeDM, setActiveDM] = useState(null); 
  const [messages, setMessages] = useState([]);
  const [dmMessages, setDmMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  
  const [newFriendName, setNewFriendName] = useState("");
  const [friendError, setFriendError] = useState("");

  const chatEndRef = useRef(null);
  const dmEndRef = useRef(null);

  useEffect(() => {
    if (!user || activeTab !== 'global') return;
    const chatRef = collection(db, 'artifacts', appId, 'public', 'data', 'global_chat');
    const unsubscribe = onSnapshot(chatRef, (snapshot) => {
      const msgs = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setMessages(msgs);
    }, (err) => console.error("Global Chat error:", err));
    return () => unsubscribe();
  }, [user, activeTab]);

  useEffect(() => {
      if (!user || activeTab !== 'friends') return;
      const dmRef = collection(db, 'artifacts', appId, 'public', 'data', 'direct_messages');
      const unsubscribe = onSnapshot(dmRef, (snapshot) => {
          const msgs = [];
          snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
          msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          setDmMessages(msgs);
      }, (err) => console.error("DM error:", err));
      return () => unsubscribe();
  }, [user, activeTab]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { dmEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [dmMessages, activeDM]);

  const sendGlobalMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !profile) return;
    try {
      const msgText = newMessage.trim();
      setNewMessage("");
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'global_chat'), {
        text: msgText, sender: profile.username, uid: user.uid, timestamp: Date.now()
      });
    } catch (err) { console.error("Send error:", err); }
  };

  const sendDirectMessage = async (e, isInvite = false, inviteGameId = null) => {
      if (e) e.preventDefault();
      if ((!newMessage.trim() && !isInvite) || !user || !profile || !activeDM) return;
      
      try {
          const payload = {
              sender: profile.username, recipient: activeDM, timestamp: Date.now(), type: isInvite ? 'invite' : 'text'
          };
          if (isInvite) {
              payload.gameId = pendingInviteGame.gameId;
              payload.roomCode = pendingInviteGame.code;
              payload.status = 'pending';
          } else {
              payload.text = newMessage.trim();
          }

          setNewMessage("");
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'direct_messages'), payload);
      } catch (err) { console.error("DM send error:", err); }
  };

  const handleAddFriend = async (e) => {
      e.preventDefault();
      setFriendError('');
      const target = newFriendName.trim().toLowerCase();
      if (!target) return;
      if (target === profile.username.toLowerCase()) { setFriendError("You can't add yourself!"); return; }
      
      const currentFriends = profile.friends || [];
      if (currentFriends.includes(target)) { setFriendError("Already on your friends list."); return; }

      try {
          const friendDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', target));
          if (friendDoc.exists()) {
              const newFriendsList = [...currentFriends, friendDoc.data().username];
              await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', profile.username.toLowerCase()), { friends: newFriendsList });
              setProfile({...profile, friends: newFriendsList});
              setNewFriendName('');
          } else {
              setFriendError("Username not found.");
          }
      } catch(e) { setFriendError("Error adding friend."); }
  };

  const filteredDMs = activeDM ? dmMessages.filter(m => 
      (m.sender.toLowerCase() === profile.username.toLowerCase() && m.recipient.toLowerCase() === activeDM.toLowerCase()) ||
      (m.sender.toLowerCase() === activeDM.toLowerCase() && m.recipient.toLowerCase() === profile.username.toLowerCase())
  ) : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[85vh] max-h-[850px] overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                {activeTab === 'global' ? <MessageSquare className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>
            <div>
                <h2 className="text-xl font-bold text-white leading-tight">Social Hub</h2>
                <p className="text-xs text-slate-400">Playing as <strong className="text-indigo-400">{profile.username}</strong></p>
            </div>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-slate-800 shrink-0 bg-slate-900">
            <button onClick={() => { setActiveTab('global'); setActiveDM(null); }} className={`flex-1 py-3 font-semibold text-sm transition-colors ${activeTab === 'global' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800'}`}>
                Global Chat
            </button>
            <button onClick={() => setActiveTab('friends')} className={`flex-1 py-3 font-semibold text-sm transition-colors ${activeTab === 'friends' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800'}`}>
                Friends & DMs
            </button>
        </div>
        
        {activeTab === 'global' && (
            <>
            <div className="flex-1 p-6 overflow-y-auto bg-slate-900/50 space-y-4">
              {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                      <p>Welcome to the Arcade! Say hello.</p>
                  </div>
              ) : (
                  messages.map(msg => {
                      const isMe = msg.uid === user.uid;
                      return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              {!isMe && <span className="text-xs text-slate-400 mb-1 ml-1 font-bold">{msg.sender}</span>}
                              <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] break-words ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'}`}>
                                  {msg.text}
                              </div>
                          </div>
                      )
                  })
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
              <form onSubmit={sendGlobalMessage} className="flex gap-2">
                <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Message the lobby..." 
                    maxLength={200}
                    className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                />
                <button type="submit" disabled={!newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-50">
                    Send
                </button>
              </form>
            </div>
            </>
        )}

        {activeTab === 'friends' && !activeDM && (
            <div className="flex-1 flex flex-col bg-slate-900/50 overflow-hidden">
                {pendingInviteGame && (
                    <div className="bg-indigo-600 p-3 text-center text-white font-bold text-sm shrink-0">
                        Select a friend to invite to {pendingInviteGame.gameId.replace(/([A-Z])/g, ' $1').trim()}!
                    </div>
                )}
                <div className="p-6 border-b border-slate-800 shrink-0">
                    <form onSubmit={handleAddFriend} className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-300">Add Friend by Username</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={newFriendName}
                                onChange={e => setNewFriendName(e.target.value)}
                                placeholder="Username..." 
                                className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2 text-white outline-none"
                            />
                            <button type="submit" disabled={!newFriendName.trim()} className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                                Add
                            </button>
                        </div>
                        {friendError && <p className="text-red-400 text-xs mt-1 font-medium">{friendError}</p>}
                    </form>
                </div>
                <div className="flex-1 p-6 overflow-y-auto">
                    <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Your Friends</h3>
                    {!profile.friends || profile.friends.length === 0 ? (
                        <p className="text-slate-500 text-center mt-10">You haven't added any friends yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {profile.friends.map(friend => (
                                <button 
                                    key={friend}
                                    onClick={() => setActiveDM(friend)}
                                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 p-4 rounded-xl flex items-center justify-between transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold">
                                            {friend.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-bold text-white text-lg">{friend}</span>
                                    </div>
                                    <MessageSquare className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'friends' && activeDM && (
            <div className="flex-1 flex flex-col bg-slate-900/50 overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/80 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setActiveDM(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <span className="font-bold text-white text-lg">{activeDM}</span>
                    </div>
                    {pendingInviteGame && (
                        <button 
                            onClick={(e) => {
                                sendDirectMessage(e, true, pendingInviteGame);
                                close();
                            }} 
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                        >
                            <Gamepad2 className="w-4 h-4" /> Send Invite
                        </button>
                    )}
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                    {filteredDMs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500">
                            <p>This is the start of your chat with {activeDM}.</p>
                        </div>
                    ) : (
                        filteredDMs.map(msg => {
                            const isMe = msg.sender.toLowerCase() === profile.username.toLowerCase();
                            
                            if (msg.type === 'invite') {
                                return (
                                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} my-2`}>
                                        <div className={`px-5 py-4 rounded-2xl max-w-[85%] border shadow-lg ${isMe ? 'bg-indigo-900/50 border-indigo-500/50 rounded-br-none' : 'bg-slate-800 border-slate-600 rounded-bl-none'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Gamepad2 className={`w-5 h-5 ${isMe ? 'text-indigo-400' : 'text-slate-400'}`} />
                                                <span className="font-bold text-white">Game Invite: {msg.gameId.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            </div>
                                            <p className="text-sm text-slate-300 mb-3">
                                                {isMe ? 'You sent an invite to play.' : `${msg.sender} invited you to play!`}
                                            </p>
                                            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-black/30 text-white">
                                                Status: <span className={msg.status === 'accepted' ? 'text-emerald-400' : msg.status === 'declined' ? 'text-red-400' : 'text-amber-400'}>{msg.status}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] break-words ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={dmEndRef} />
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
                    <form onSubmit={(e) => sendDirectMessage(e, false)} className="flex gap-2">
                        <input 
                            type="text" 
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder={`Message ${activeDM}...`} 
                            maxLength={200}
                            className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                        />
                        <button type="submit" disabled={!newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-50">
                            Send
                        </button>
                    </form>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

// --- UTILITY MODALS & PLACEHOLDERS ---
function PlaceholderGame({ title, icon, navigate }) {
  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
       <button onClick={() => navigate('menu')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-lg mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Arcade
        </button>
      <div className="bg-slate-800/50 border border-slate-700 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center min-h-[500px]">
        <div className="text-indigo-400 mb-6 animate-pulse">{icon}</div>
        <h2 className="text-4xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400 text-lg">Under construction in the Arcade Hub.</p>
      </div>
    </div>
  );
}

function SettingsModal({ close, settings, setSettings, profile, setProfile, user }) {
  const [activeTab, setActiveTab] = useState('game'); // 'game' or 'account'
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  const handleUpdateAccount = async (e) => {
      e.preventDefault();
      if (!user || !profile) return;
      setLoading(true);
      setAccountMsg({ text: '', type: '' });

      try {
          const cleanOldUsername = profile.username.toLowerCase();
          const cleanNewUsername = newUsername.trim().toLowerCase();
          
          let updatedProfile = { ...profile };
          let changed = false;

          // Handle Username Change
          if (cleanNewUsername && cleanNewUsername !== cleanOldUsername) {
              const newRef = doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', cleanNewUsername);
              const snap = await getDoc(newRef);
              if (snap.exists()) {
                  setAccountMsg({ text: 'That username is already taken!', type: 'error' });
                  setLoading(false);
                  return;
              }
              
              updatedProfile.username = newUsername.trim();
              if (newPassword) updatedProfile.password = newPassword;
              
              await setDoc(newRef, updatedProfile);
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', cleanOldUsername));
              changed = true;
          } 
          // Handle Password Only Change
          else if (newPassword && newPassword !== profile.password) {
              updatedProfile.password = newPassword;
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'arcade_profiles', cleanOldUsername);
              await setDoc(ref, updatedProfile);
              changed = true;
          }

          if (changed) {
              setProfile(updatedProfile);
              setNewUsername('');
              setNewPassword('');
              setAccountMsg({ text: 'Account successfully updated!', type: 'success' });
          } else {
              setAccountMsg({ text: 'No changes were made.', type: 'error' });
          }

      } catch (err) {
          console.error(err);
          setAccountMsg({ text: 'Error updating account.', type: 'error' });
      }
      setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-400" /><h2 className="text-xl font-bold text-white">Settings</h2></div>
          <button onClick={close} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="flex border-b border-slate-800 shrink-0">
            <button onClick={() => setActiveTab('game')} className={`flex-1 py-3 font-semibold text-sm ${activeTab === 'game' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800'}`}>Game Settings</button>
            <button onClick={() => setActiveTab('account')} className={`flex-1 py-3 font-semibold text-sm ${activeTab === 'account' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800'}`}>Account Profile</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {activeTab === 'game' ? (
             <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">AI Difficulty</label>
                  <div className="flex gap-2 bg-slate-800 p-1 rounded-lg">
                    {['easy', 'medium', 'hard'].map(diff => (
                      <button key={diff} onClick={() => setSettings({...settings, difficulty: diff})} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium capitalize transition-colors ${settings.difficulty === diff ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>{diff}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div><label className="text-sm font-medium text-slate-300">Aim Assist (Pool)</label></div>
                  <button onClick={() => setSettings({...settings, showTrajectory: !settings.showTrajectory})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.showTrajectory ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.showTrajectory ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
             </div>
          ) : (
             <div className="space-y-4">
                 <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl mb-4">
                     <p className="text-sm text-indigo-300">Currently logged in as: <strong className="text-white">{profile?.username}</strong></p>
                 </div>
                 
                 <form onSubmit={handleUpdateAccount} className="space-y-4">
                     <div>
                         <label className="block text-xs font-medium text-slate-400 mb-1">Change Username</label>
                         <div className="relative">
                            <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                                type="text" 
                                value={newUsername} 
                                onChange={e => setNewUsername(e.target.value)} 
                                placeholder={profile?.username}
                                maxLength={16}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg pl-10 pr-4 py-2.5 text-white outline-none"
                            />
                         </div>
                     </div>
                     <div>
                         <label className="block text-xs font-medium text-slate-400 mb-1">Change Password</label>
                         <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                                type="password" 
                                value={newPassword} 
                                onChange={e => setNewPassword(e.target.value)} 
                                placeholder="Enter new password..."
                                maxLength={30}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg pl-10 pr-4 py-2.5 text-white outline-none"
                            />
                         </div>
                     </div>
                     
                     {accountMsg.text && (
                         <p className={`text-sm font-medium ${accountMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                             {accountMsg.text}
                         </p>
                     )}

                     <button 
                        type="submit" 
                        disabled={loading || (!newUsername.trim() && !newPassword)}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                     >
                         {loading ? 'Saving...' : 'Update Account'}
                     </button>
                 </form>
             </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end shrink-0">
          <button onClick={close} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

function TrophyModal({ close, stats }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /><h2 className="text-xl font-bold text-white">Your Stats</h2></div>
          <button onClick={close} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="bg-slate-800 p-4 rounded-xl flex justify-between items-center"><span className="text-slate-300 font-medium">Arcade Plays</span><span className="text-2xl font-bold text-indigo-400">{stats.gamesPlayed}</span></div>
            <p className="text-center text-sm text-slate-500 pt-4">More stats coming soon!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
