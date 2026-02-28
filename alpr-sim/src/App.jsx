import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// 🔑 METTEZ VOTRE CLÉ OPENROUTER ICI
// ============================================================
const OPENROUTER_API_KEY =
  "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";
// ============================================================

const TUNISIAN_MODELS = [
  "Peugeot 206",
  "Golf 7",
  "Clio 4",
  "Symbol",
  "Isuzu D-Max",
  "Dacia Logan",
  "Kia Picanto",
  "Hyundai i10",
  "Citroën C3",
  "Fiat Punto",
];
const CATEGORIES = ["Visiteur", "Abonné", "VIP", "Personnel"];
const CAT_COLOR = {
  Visiteur: "#38bdf8",
  Abonné: "#4ade80",
  VIP: "#fbbf24",
  Personnel: "#e879f9",
};

const PARKING_RULES = `RÈGLEMENT INTÉRIEUR — SMART PARK TN:
- Tarif visiteur: 1 TND/minute dès l'entrée (pas de période gratuite).
- Abonnés (liste): forfait mensuel, accès illimité, gratuit.
- Autorisés sous conditions (liste): accès accordé, tarif Personnel (gratuit 7h–19h, sinon 1 TND/h).
- VIP: stationnement toujours gratuit, Zone A réservée.
- Personnel: gratuit 7h–19h, sinon 1 TND/h.
- Liste Noire: accès refusé, sécurité alertée.
- Durée maximale visiteurs: 8 heures.
- En cas de litige: sécurité poste 101.`;

// ── EDITABLE LISTS (initial values) ──
const INITIAL_BLACKLIST = ["123 تونس 4567", "191 تونس 179"];
const INITIAL_ABONNES = ["140 تونس 1714", "182 تونس 2759"];
const INITIAL_AUTORISES = ["121 تونس 4099"];

function isInList(plate, list) {
  return list.some(
    (b) =>
      plate.replace(/ /g, "") === b.replace(/ /g, "") ||
      plate.includes(b.replace(/ /g, "").trim()),
  );
}

function isBlacklisted(plate, bl) {
  return isInList(plate, bl);
}

function maybeBlacklistPlate(bl) {
  if (bl.length > 0 && Math.random() < 0.1)
    return bl[Math.floor(Math.random() * bl.length)];
  return null;
}

// ── ACCESS DECISION ──
function decideAccess(car, bl, abonnes, autorises) {
  if (isBlacklisted(car.plate, bl)) {
    return {
      allowed: false,
      reason:
        "🚫 LISTE NOIRE — véhicule signalé volé. Sécurité alertée (poste 101).",
      rule: "Blacklist",
    };
  }
  if (isInList(car.plate, abonnes)) {
    return {
      allowed: true,
      reason: "✅ Abonné — forfait mensuel, accès illimité.",
      rule: "Abonnement",
    };
  }
  const hour = new Date().getHours();
  if (isInList(car.plate, autorises)) {
    return {
      allowed: true,
      reason:
        hour >= 7 && hour < 19
          ? "⚠️ Autorisé sous conditions — accès accordé, gratuit (7h–19h)."
          : "⚠️ Autorisé sous conditions — accès accordé, tarif 1 TND/h.",
      rule: "Autorisé",
    };
  }
  switch (car.category) {
    case "Abonné":
      return {
        allowed: true,
        reason: "✅ Abonné — forfait mensuel, accès illimité.",
        rule: "Abonnement",
      };
    case "VIP":
      return {
        allowed: true,
        reason: "✅ VIP — accès gratuit, Zone A réservée.",
        rule: "VIP",
      };
    case "Personnel":
      return {
        allowed: true,
        reason:
          hour >= 7 && hour < 19
            ? "✅ Personnel — accès gratuit (horaires 7h–19h)."
            : "✅ Personnel — accès autorisé (hors horaire gratuit, tarif 1 TND/h).",
        rule: "Personnel",
      };
    case "Visiteur":
    default:
      return {
        allowed: true,
        reason: "✅ Visiteur — 1 TND/min dès l'entrée. Durée max: 8h.",
        rule: "Visiteur",
      };
  }
}

// ── TARIFF CALCULATOR ──
function calcTariff(car) {
  if (!car.entryDate) return { duration: "—", tariff: "—", overstay: false };
  const end = car.exitDate || new Date();
  const diffMs = end - car.entryDate;
  const diffMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const durationStr =
    hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins} min`;

  let tariff = 0;
  let overstay = false;
  const billableHoursPersonnel = Math.ceil(Math.max(0, diffMin - 15) / 60);

  // Check if decision rule overrides category
  const rule = car.decision?.rule;

  if (rule === "Abonnement") {
    tariff = 0;
  } else if (rule === "Autorisé") {
    const h = car.entryDate.getHours();
    if (h >= 7 && h < 19) tariff = 0;
    else tariff = billableHoursPersonnel * 1;
  } else {
    switch (car.category) {
      case "Abonné":
        tariff = 0;
        break;
      case "VIP":
        tariff = 0;
        break;
      case "Personnel": {
        const h = car.entryDate.getHours();
        if (h >= 7 && h < 19) tariff = 0;
        else tariff = billableHoursPersonnel * 1;
        break;
      }
      case "Visiteur":
      default:
        tariff = diffMin * 1; // 1 TND per minute, no free period
        if (diffMin > 8 * 60) overstay = true;
        break;
    }
  }
  return {
    duration: durationStr,
    tariff: tariff > 0 ? `${tariff} TND` : "Gratuit",
    overstay,
  };
}

// Available plate images in public/matricule mapped to real plate values
const PLATE_MAP = {
  4: "62 تونس 1040",
  5: "140 تونس 1714",
  6: "121 تونس 4099",
  34: "182 تونس 2759",
  37: "160 تونس 2955",
  39: "156 تونس 6916",
  40: "120 تونس 5039",
  42: "191 تونس 179",
  45: "72 تونس 7486",
  47: "160 تونس 2955",
};
const PLATE_KEYS = Object.keys(PLATE_MAP);
function pickPlate() {
  const key = PLATE_KEYS[Math.floor(Math.random() * PLATE_KEYS.length)];
  return { plateImg: `/matricule/${key}.png`, plate: PLATE_MAP[key] };
}

function genCar(bl, abonnes, autorises) {
  const blackPlate = maybeBlacklistPlate(bl);
  const picked = pickPlate();
  const plate = blackPlate || picked.plate;
  const model =
    TUNISIAN_MODELS[Math.floor(Math.random() * TUNISIAN_MODELS.length)];
  // Determine category based on list membership
  let cat;
  if (blackPlate) {
    cat = "Visiteur";
  } else if (isInList(plate, abonnes)) {
    cat = "Abonné";
  } else if (isInList(plate, autorises)) {
    cat = "Personnel";
  } else {
    cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  }
  const car = {
    id: Date.now() + Math.random(),
    plate,
    model,
    category: cat,
    entry: new Date().toLocaleTimeString("fr-FR"),
    exit: null,
    status: "Garé",
    entryDate: new Date(),
    exitDate: null,
    plateImg: picked.plateImg,
    decision: null, // filled after ALPR
  };
  car.decision = decideAccess(car, bl, abonnes, autorises);
  return car;
}

// ─── Top-down car SVG (viewed from above) ───
const TopCar = ({ color, rotation = 0, size = 36 }) => (
  <svg
    width={size}
    height={size * 1.8}
    viewBox="0 0 20 36"
    fill="none"
    style={{ transform: `rotate(${rotation}deg)`, display: "block" }}
  >
    {/* Body */}
    <rect x="2" y="4" width="16" height="28" rx="4" fill={color} />
    {/* Hood */}
    <rect
      x="4"
      y="2"
      width="12"
      height="8"
      rx="3"
      fill={color}
      opacity="0.85"
    />
    {/* Windshield */}
    <rect
      x="5"
      y="5"
      width="10"
      height="6"
      rx="2"
      fill="#bfdbfe"
      opacity="0.7"
    />
    {/* Rear window */}
    <rect
      x="5"
      y="24"
      width="10"
      height="5"
      rx="2"
      fill="#bfdbfe"
      opacity="0.5"
    />
    {/* Wheels */}
    <rect x="0" y="6" width="3" height="5" rx="1" fill="#1e293b" />
    <rect x="17" y="6" width="3" height="5" rx="1" fill="#1e293b" />
    <rect x="0" y="25" width="3" height="5" rx="1" fill="#1e293b" />
    <rect x="17" y="25" width="3" height="5" rx="1" fill="#1e293b" />
    {/* Headlights */}
    <rect
      x="4"
      y="2"
      width="4"
      height="2"
      rx="1"
      fill="#fde68a"
      opacity="0.9"
    />
    <rect
      x="12"
      y="2"
      width="4"
      height="2"
      rx="1"
      fill="#fde68a"
      opacity="0.9"
    />
    {/* Taillights */}
    <rect
      x="4"
      y="33"
      width="4"
      height="2"
      rx="1"
      fill="#fca5a5"
      opacity="0.9"
    />
    <rect
      x="12"
      y="33"
      width="4"
      height="2"
      rx="1"
      fill="#fca5a5"
      opacity="0.9"
    />
  </svg>
);

// ─── Scene constants (all in SVG user units, viewBox 800×300) ───
const VB_W = 800,
  VB_H = 300;

// Entry street (left) → parking lot (center) → exit street (right)
// Road / drive aisle runs horizontally through the center of all zones

const LANE_Y = 118; // center Y for cars on road / aisle
const ENTRY_LANE_Y = LANE_Y;
const EXIT_LANE_Y = LANE_Y;
const ENTRY_CAM_X = 130; // camera on entry street (left)
const EXIT_CAM_X = 660; // camera on exit street (right)
const PARK_LEFT = 250; // left edge of parking lot
const PARK_RIGHT = 550; // right edge
const PARK_TOP = 8;
const PARK_BOTTOM = 232;
const ROAD_TOP = 88; // top of road / aisle band
const ROAD_BOTTOM = 148; // bottom of road / aisle band

// Parking spots: top row (7) above road + bottom row (7) below road = 14
const SPOTS = [];
for (let col = 0; col < 7; col++) {
  SPOTS.push({ x: PARK_LEFT + 8 + col * 42, y: 18, w: 38, h: 60 });
}
for (let col = 0; col < 7; col++) {
  SPOTS.push({ x: PARK_LEFT + 8 + col * 42, y: 160, w: 38, h: 60 });
}

export default function App() {
  const [cars, setCars] = useState([]);

  // ── EDITABLE LISTS ──
  const [blacklist, setBlacklist] = useState(INITIAL_BLACKLIST);
  const [blInput, setBlInput] = useState("");
  const [showBlPanel, setShowBlPanel] = useState(false);

  const [abonnes, setAbonnes] = useState(INITIAL_ABONNES);
  const [abInput, setAbInput] = useState("");
  const [showAbPanel, setShowAbPanel] = useState(false);

  const [autorises, setAutorises] = useState(INITIAL_AUTORISES);
  const [auInput, setAuInput] = useState("");
  const [showAuPanel, setShowAuPanel] = useState(false);

  // Entry animation: car starts far left, moves right to ENTRY_CAM_X, pauses, moves right to park
  const [entryState, setEntryState] = useState("idle");
  const [entryX, setEntryX] = useState(-60);
  const [entrySig, setEntrySig] = useState({
    cam: false,
    det: false,
    loc: false,
    ocr: false,
  });
  const [entryBox, setEntryBox] = useState({
    det: "",
    loc: "",
    ocr: "",
    plateImg: "",
  });
  const [pendingCar, setPendingCar] = useState(null);
  const [accessAlert, setAccessAlert] = useState(null); // { allowed, reason, plate }

  // Exit animation: car starts inside park, moves right to EXIT_CAM_X, pauses, exits right
  const [exitState, setExitState] = useState("idle");
  const [exitX, setExitX] = useState(PARK_RIGHT - 30);
  const [exitSig, setExitSig] = useState({ cam: false });
  const [exitingCar, setExitingCar] = useState(null);

  // ── DARK / LIGHT MODE ──
  const [dark, setDark] = useState(true);
  const T = dark
    ? {
        bg: "#0f172a",
        bg2: "#0a1020",
        text: "#f1f5f9",
        textSec: "#94a3b8",
        textDim: "#475569",
        textDimmer: "#334155",
        border: "#1e293b",
        rowAlt: "rgba(30,41,59,0.25)",
        chatUser: "rgba(99,102,241,0.2)",
        chatBot: "rgba(30,41,59,0.7)",
        chatUserBorder: "#4338ca",
        chatUserText: "#c7d2fe",
        chatBotText: "#e2e8f0",
        inputBg: "#0f172a",
        scrollTrack: "#0f172a",
        scrollThumb: "#334155",
        quickBtnBg: "rgba(30,41,59,0.5)",
        btnDisabledBg: "#1e293b",
        btnDisabledText: "#334155",
        noEventText: "#64748b",
        exitBtnBg: "rgba(239,68,68,0.1)",
        exitBtnBorder: "rgba(239,68,68,0.4)",
        exitBtnText: "#fca5a5",
        hoverShadow: "rgba(56,189,248,0.5)",
        plateText: "#f1f5f9",
        entryTime: "#64748b",
        statusSorti: "#64748b",
        askBtnBg: "rgba(99,102,241,0.12)",
        askBtnBorder: "#4338ca",
        askBtnText: "#a5b4fc",
        alprBoxBg: "rgba(15,23,42,0.85)",
        alprBorder: "#b9bfc6",
        alprText: "#e1e1e1ff",
        alprLabel: "#b6b6b6",
        chatSubtext: "#334155",
        onlineText: "#22c55e",
      }
    : {
        bg: "#f8fafc",
        bg2: "#ffffff",
        text: "#0f172a",
        textSec: "#475569",
        textDim: "#94a3b8",
        textDimmer: "#cbd5e1",
        border: "#e2e8f0",
        rowAlt: "rgba(241,245,249,0.7)",
        chatUser: "rgba(99,102,241,0.1)",
        chatBot: "rgba(241,245,249,0.9)",
        chatUserBorder: "#818cf8",
        chatUserText: "#312e81",
        chatBotText: "#1e293b",
        inputBg: "#f1f5f9",
        scrollTrack: "#f8fafc",
        scrollThumb: "#cbd5e1",
        quickBtnBg: "rgba(241,245,249,0.8)",
        btnDisabledBg: "#e2e8f0",
        btnDisabledText: "#94a3b8",
        noEventText: "#64748b",
        exitBtnBg: "rgba(239,68,68,0.06)",
        exitBtnBorder: "rgba(239,68,68,0.3)",
        exitBtnText: "#dc2626",
        hoverShadow: "rgba(14,165,233,0.3)",
        plateText: "#0f172a",
        entryTime: "#475569",
        statusSorti: "#475569",
        askBtnBg: "rgba(99,102,241,0.08)",
        askBtnBorder: "#818cf8",
        askBtnText: "#4338ca",
        alprBoxBg: "rgba(255,255,255,0.85)",
        alprBorder: "#94a3b8",
        alprText: "#1e293b",
        alprLabel: "#64748b",
        chatSubtext: "#94a3b8",
        onlineText: "#16a34a",
      };

  // ── DOCUMENT UPLOAD FOR RAG ──
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const fileInputRef = useRef(null);
  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedDocs((prev) => [
          ...prev,
          { name: file.name, content: ev.target.result.slice(0, 8000) },
        ]);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  // Chatbot
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Bonjour! Je suis l'Assistant Tunis Park 🏙️\nPosez-moi vos questions sur les véhicules ou les règlements.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ── ENTRY ──
  const runEntry = useCallback(() => {
    if (entryState !== "idle" || exitState !== "idle") return;
    const car = genCar(blacklist, abonnes, autorises);
    setPendingCar(car);
    setEntryState("moving");
    setEntryX(-60);
    setEntryBox({ det: "", loc: "", ocr: "", plateImg: car.plateImg });
    setEntrySig({ cam: false, det: false, loc: false, ocr: false });

    let x = -60;
    const step = () => {
      x += 5;
      setEntryX(x);
      if (x < ENTRY_CAM_X) {
        requestAnimationFrame(step);
        return;
      }
      // Arrived at camera
      setEntryState("processing");
      setEntrySig((s) => ({ ...s, cam: true }));
      setTimeout(() => {
        setEntrySig((s) => ({ ...s, det: true }));
        setEntryBox((b) => ({ ...b, det: "Véhicule ✓" }));
        setTimeout(() => {
          setEntrySig((s) => ({ ...s, loc: true }));
          setEntryBox((b) => ({ ...b, loc: "Plaque ✓" }));
          setTimeout(() => {
            setEntrySig((s) => ({ ...s, ocr: true }));
            setEntryBox((b) => ({ ...b, ocr: car.plate }));
            // Show access decision
            setAccessAlert({
              allowed: car.decision.allowed,
              reason: car.decision.reason,
              plate: car.plate,
            });
            setTimeout(() => {
              if (!car.decision.allowed) {
                // DENIED — car reverses out (moves left off screen)
                setEntryState("denied");
                let x2 = ENTRY_CAM_X;
                const stepDeny = () => {
                  x2 -= 6;
                  setEntryX(x2);
                  if (x2 > -80) {
                    requestAnimationFrame(stepDeny);
                    return;
                  }
                  setCars((prev) => [...prev, { ...car, status: "Refusé" }]);
                  setEntryState("idle");
                  setEntryX(-60);
                  setEntrySig({
                    cam: false,
                    det: false,
                    loc: false,
                    ocr: false,
                  });
                  setPendingCar(null);
                  setTimeout(() => setAccessAlert(null), 3000);
                };
                requestAnimationFrame(stepDeny);
              } else {
                // ALLOWED
                setEntryState("parking");
                let x2 = ENTRY_CAM_X;
                const step2 = () => {
                  x2 += 4;
                  setEntryX(x2);
                  if (x2 < PARK_LEFT + 80) {
                    requestAnimationFrame(step2);
                    return;
                  }
                  setCars((prev) => [...prev, car]);
                  setEntryState("idle");
                  setEntryX(-60);
                  setEntrySig({
                    cam: false,
                    det: false,
                    loc: false,
                    ocr: false,
                  });
                  setPendingCar(null);
                  setTimeout(() => setAccessAlert(null), 2000);
                };
                requestAnimationFrame(step2);
              }
            }, 1200);
          }, 700);
        }, 700);
      }, 500);
    };
    requestAnimationFrame(step);
  }, [entryState, exitState, blacklist, abonnes, autorises]);

  // ── EXIT ──
  const runExit = useCallback(
    (carId) => {
      if (exitState !== "idle" || entryState !== "idle") return;
      const car = cars.find((c) => c.id === carId);
      if (!car) return;
      setExitingCar(car);
      setExitState("moving");
      setExitSig({ cam: false });

      let x = PARK_RIGHT - 30;
      setExitX(x);
      const step = () => {
        x += 4;
        setExitX(x);
        if (x < EXIT_CAM_X) {
          requestAnimationFrame(step);
          return;
        }
        setExitSig({ cam: true });
        setTimeout(() => {
          setExitState("leaving");
          let x2 = EXIT_CAM_X;
          const step2 = () => {
            x2 += 5;
            setExitX(x2);
            if (x2 < VB_W + 80) {
              requestAnimationFrame(step2);
              return;
            }
            const exitDate = new Date();
            setCars((prev) =>
              prev.map((c) =>
                c.id === carId
                  ? {
                      ...c,
                      status: "Sorti",
                      exit: exitDate.toLocaleTimeString("fr-FR"),
                      exitDate,
                    }
                  : c,
              ),
            );
            setExitState("idle");
            setExitSig({ cam: false });
            setExitingCar(null);
          };
          requestAnimationFrame(step2);
        }, 1200);
      };
      requestAnimationFrame(step);
    },
    [exitState, entryState, cars],
  );

  // ── CHAT ──
  const askAboutCar = (car) => {
    setInput(
      `Parle-moi du véhicule plaque ${car.plate} (${car.model}, ${car.category}), entré à ${car.entry}${car.exit ? ", sorti à " + car.exit : ""}.`,
    );
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    const logs =
      cars.length === 0
        ? "Aucun véhicule."
        : cars
            .map((c) => {
              const t = calcTariff(c);
              return `${c.plate} | ${c.model} | ${c.category} | Entrée:${c.entry} | Sortie:${c.exit || "en cours"} | ${c.status} | Durée:${t.duration} | Tarif:${t.tariff}${t.overstay ? " ⚠DÉPASSEMENT" : ""} | Décision:${c.decision?.reason || "Autorisé"}`;
            })
            .join("\n");
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://smartpark.tn",
          "X-Title": "Smart Park TN",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Tu es l'Assistant Tunis Park. Règlements:\n${PARKING_RULES}\n\nLogs actuels:\n${logs}${uploadedDocs.length > 0 ? "\n\nDocuments uploadés:\n" + uploadedDocs.map((d) => `[${d.name}]:\n${d.content}`).join("\n\n") : ""}\n\nRéponds en français, de façon concise et professionnelle.`,
            },
            { role: "user", content: msg },
          ],
        }),
      });
      const d = await r.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: d.choices?.[0]?.message?.content || "Erreur.",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Erreur de connexion." },
      ]);
    }
    setLoading(false);
  };

  /* Live clock tick — forces re-render every 30s so duration/tariff update */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const parkedCars = cars.filter((c) => c.status === "Garé");

  // SVG pixel position of entry car (convert from SVG units to %)
  // We'll render the car as an absolutely positioned div over the SVG using a ref
  const svgRef = useRef(null);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        transition: "background 0.3s, color 0.3s",
      }}
    >
      {/* GOOGLE FONTS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        html,body,#root { height:100%; width:100%; overflow:hidden; }
        @keyframes dash { to { stroke-dashoffset:-20; } }
        @keyframes glow { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:${T.scrollTrack}; }
        ::-webkit-scrollbar-thumb { background:${T.scrollThumb}; border-radius:2px; }
        .btn-entry { transition: all 0.2s; }
        .btn-entry:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 20px ${T.hoverShadow} !important; }
        .exit-btn:hover:not(:disabled) { background: rgba(239,68,68,0.2) !important; }
        .chat-input:focus { border-color: #38bdf8 !important; }
        .ask-btn:hover { background: rgba(99,102,241,0.25) !important; }
      `}</style>

      {/* ═══════════ LEFT + CENTER ═══════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "11px 20px",
            background: T.bg,
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
            transition: "background 0.3s",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0ea5e9",
              borderRadius: 0,
              padding: "5px 14px",
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#fff",
                fontFamily: "'Space Grotesk',sans-serif",
                letterSpacing: 1,
              }}
            >
              🅿️ SMART PARK TN
            </span>
          </div>

          {/* Dark / Light toggle */}
          <button
            onClick={() => setDark((d) => !d)}
            style={{
              marginLeft: 16,
              background: dark
                ? "rgba(241,245,249,0.1)"
                : "rgba(15,23,42,0.08)",
              border: `1px solid ${T.border}`,
              borderRadius: 0,
              padding: "5px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.3s",
            }}
          >
            <span style={{ fontSize: 14 }}>{dark ? "☀️" : "🌙"}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: T.textSec,
                fontFamily: "'Space Grotesk',sans-serif",
                letterSpacing: 0.5,
              }}
            >
              {dark ? "CLAIR" : "SOMBRE"}
            </span>
          </button>

          {/* Blacklist toggle */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowBlPanel((v) => !v);
                setShowAbPanel(false);
                setShowAuPanel(false);
              }}
              style={{
                background: showBlPanel
                  ? "rgba(239,68,68,0.15)"
                  : dark
                    ? "rgba(241,245,249,0.1)"
                    : "rgba(15,23,42,0.08)",
                border: `1px solid ${showBlPanel ? "#ef4444" : T.border}`,
                borderRadius: 0,
                padding: "5px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 13 }}>🚫</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: showBlPanel ? "#ef4444" : T.textSec,
                  fontFamily: "'Space Grotesk',sans-serif",
                  letterSpacing: 0.5,
                }}
              >
                LISTE NOIRE ({blacklist.length})
              </span>
            </button>
            {showBlPanel && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  zIndex: 50,
                  background: T.bg2,
                  border: `1.5px solid ${T.border}`,
                  borderRadius: 10,
                  padding: 12,
                  minWidth: 260,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.text,
                    marginBottom: 8,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}
                >
                  🚫 Gérer la Liste Noire
                </div>
                {blacklist.length === 0 ? (
                  <div
                    style={{ fontSize: 10, color: T.textDim, padding: "6px 0" }}
                  >
                    Aucune plaque en liste noire
                  </div>
                ) : (
                  blacklist.map((pl, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                        padding: "4px 8px",
                        background: "rgba(239,68,68,0.08)",
                        borderRadius: 6,
                        border: "1px solid rgba(239,68,68,0.2)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#ef4444",
                          direction: "rtl",
                          fontFamily: "'Space Grotesk',sans-serif",
                        }}
                      >
                        {pl}
                      </span>
                      <button
                        onClick={() =>
                          setBlacklist((prev) => prev.filter((_, j) => j !== i))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 2px",
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    value={blInput}
                    onChange={(e) => setBlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && blInput.trim()) {
                        setBlacklist((prev) => [...prev, blInput.trim()]);
                        setBlInput("");
                      }
                    }}
                    placeholder="Ex: 123 تونس 4567"
                    style={{
                      flex: 1,
                      background: T.inputBg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "5px 8px",
                      color: T.text,
                      fontSize: 11,
                      fontFamily: "'Space Grotesk',sans-serif",
                      outline: "none",
                      direction: "rtl",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (blInput.trim()) {
                        setBlacklist((prev) => [...prev, blInput.trim()]);
                        setBlInput("");
                      }
                    }}
                    style={{
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid #ef4444",
                      borderRadius: 6,
                      padding: "4px 10px",
                      color: "#ef4444",
                      fontSize: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif",
                    }}
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── ABONNÉS PANEL ── */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowAbPanel((v) => !v);
                setShowBlPanel(false);
                setShowAuPanel(false);
              }}
              style={{
                background: showAbPanel
                  ? "rgba(74,222,128,0.15)"
                  : dark
                    ? "rgba(241,245,249,0.1)"
                    : "rgba(15,23,42,0.08)",
                border: `1px solid ${showAbPanel ? "#4ade80" : T.border}`,
                borderRadius: 0,
                padding: "5px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 13 }}>✅</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: showAbPanel ? "#4ade80" : T.textSec,
                  fontFamily: "'Space Grotesk',sans-serif",
                  letterSpacing: 0.5,
                }}
              >
                ABONNÉS ({abonnes.length})
              </span>
            </button>
            {showAbPanel && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  zIndex: 50,
                  background: T.bg2,
                  border: `1.5px solid ${T.border}`,
                  borderRadius: 10,
                  padding: 12,
                  minWidth: 260,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.text,
                    marginBottom: 8,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}
                >
                  ✅ Gérer les Abonnés
                </div>
                {abonnes.length === 0 ? (
                  <div
                    style={{ fontSize: 10, color: T.textDim, padding: "6px 0" }}
                  >
                    Aucun abonné enregistré
                  </div>
                ) : (
                  abonnes.map((pl, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                        padding: "4px 8px",
                        background: "rgba(74,222,128,0.08)",
                        borderRadius: 6,
                        border: "1px solid rgba(74,222,128,0.2)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#4ade80",
                          direction: "rtl",
                          fontFamily: "'Space Grotesk',sans-serif",
                        }}
                      >
                        {pl}
                      </span>
                      <button
                        onClick={() =>
                          setAbonnes((prev) => prev.filter((_, j) => j !== i))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#4ade80",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 2px",
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    value={abInput}
                    onChange={(e) => setAbInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && abInput.trim()) {
                        setAbonnes((prev) => [...prev, abInput.trim()]);
                        setAbInput("");
                      }
                    }}
                    placeholder="Ex: 140 تونس 1714"
                    style={{
                      flex: 1,
                      background: T.inputBg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "5px 8px",
                      color: T.text,
                      fontSize: 11,
                      fontFamily: "'Space Grotesk',sans-serif",
                      outline: "none",
                      direction: "rtl",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (abInput.trim()) {
                        setAbonnes((prev) => [...prev, abInput.trim()]);
                        setAbInput("");
                      }
                    }}
                    style={{
                      background: "rgba(74,222,128,0.15)",
                      border: "1px solid #4ade80",
                      borderRadius: 6,
                      padding: "4px 10px",
                      color: "#4ade80",
                      fontSize: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif",
                    }}
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── AUTORISÉS SOUS CONDITIONS PANEL ── */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowAuPanel((v) => !v);
                setShowBlPanel(false);
                setShowAbPanel(false);
              }}
              style={{
                background: showAuPanel
                  ? "rgba(251,191,36,0.15)"
                  : dark
                    ? "rgba(241,245,249,0.1)"
                    : "rgba(15,23,42,0.08)",
                border: `1px solid ${showAuPanel ? "#fbbf24" : T.border}`,
                borderRadius: 0,
                padding: "5px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 13 }}>⚠️</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: showAuPanel ? "#fbbf24" : T.textSec,
                  fontFamily: "'Space Grotesk',sans-serif",
                  letterSpacing: 0.5,
                }}
              >
                AUTORISÉS ({autorises.length})
              </span>
            </button>
            {showAuPanel && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  zIndex: 50,
                  background: T.bg2,
                  border: `1.5px solid ${T.border}`,
                  borderRadius: 10,
                  padding: 12,
                  minWidth: 280,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.text,
                    marginBottom: 4,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}
                >
                  ⚠️ Autorisés sous conditions
                </div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 8 }}>
                  Gratuit 7h–19h, sinon 1 TND/h
                </div>
                {autorises.length === 0 ? (
                  <div
                    style={{ fontSize: 10, color: T.textDim, padding: "6px 0" }}
                  >
                    Aucune plaque enregistrée
                  </div>
                ) : (
                  autorises.map((pl, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                        padding: "4px 8px",
                        background: "rgba(251,191,36,0.08)",
                        borderRadius: 6,
                        border: "1px solid rgba(251,191,36,0.2)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#fbbf24",
                          direction: "rtl",
                          fontFamily: "'Space Grotesk',sans-serif",
                        }}
                      >
                        {pl}
                      </span>
                      <button
                        onClick={() =>
                          setAutorises((prev) => prev.filter((_, j) => j !== i))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fbbf24",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 2px",
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    value={auInput}
                    onChange={(e) => setAuInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && auInput.trim()) {
                        setAutorises((prev) => [...prev, auInput.trim()]);
                        setAuInput("");
                      }
                    }}
                    placeholder="Ex: 121 تونس 4099"
                    style={{
                      flex: 1,
                      background: T.inputBg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "5px 8px",
                      color: T.text,
                      fontSize: 11,
                      fontFamily: "'Space Grotesk',sans-serif",
                      outline: "none",
                      direction: "rtl",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (auInput.trim()) {
                        setAutorises((prev) => [...prev, auInput.trim()]);
                        setAuInput("");
                      }
                    }}
                    style={{
                      background: "rgba(251,191,36,0.15)",
                      border: "1px solid #fbbf24",
                      borderRadius: 6,
                      padding: "4px 10px",
                      color: "#fbbf24",
                      fontSize: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif",
                    }}
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 20 }}>
            {[
              ["GARÉS", parkedCars.length, "#38bdf8"],
              [
                "SORTIS",
                cars.filter((c) => c.status === "Sorti").length,
                T.textSec,
              ],
              ["TOTAL", cars.length, T.text],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: c,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}
                >
                  {v}
                </div>
                <div
                  style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SIMULATION ═══ */}
        <div
          style={{
            padding: "6px 18px 4px",
            background: T.bg,
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "background 0.3s",
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: T.text,
              fontFamily: "'Space Grotesk',sans-serif",
              letterSpacing: 0.5,
            }}
          >
            🗺️ Simulation du Parking
          </span>
          <span style={{ fontSize: 15, color: T.textDim }}>
            — Vue en temps réel
          </span>
        </div>
        <div
          ref={svgRef}
          style={{
            position: "relative",
            flexShrink: 0,
            background: "linear-gradient(180deg, #87ceeb 0%, #e0f2fe 100%)",
            borderBottom: "2px solid #94a3b8",
            height: 300,
            overflow: "hidden",
          }}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            height="300"
            style={{ position: "absolute", top: 0, left: 0 }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* ── BACKGROUND (daylight sky) ── */}
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#87ceeb" />
                <stop offset="100%" stopColor="#e0f2fe" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#skyGrad)" />

            {/* ── GRASS / LANDSCAPE (daylight) ── */}
            <rect
              x="0"
              y="0"
              width={PARK_LEFT}
              height={ROAD_TOP}
              fill="#4ade80"
              opacity="0.35"
            />
            <rect
              x={PARK_RIGHT}
              y="0"
              width={VB_W - PARK_RIGHT}
              height={ROAD_TOP}
              fill="#4ade80"
              opacity="0.35"
            />
            <rect
              x="0"
              y={ROAD_BOTTOM}
              width={PARK_LEFT}
              height={VB_H - ROAD_BOTTOM}
              fill="#4ade80"
              opacity="0.3"
            />
            <rect
              x={PARK_RIGHT}
              y={ROAD_BOTTOM}
              width={VB_W - PARK_RIGHT}
              height={VB_H - ROAD_BOTTOM}
              fill="#4ade80"
              opacity="0.3"
            />

            {/* ── ENTRY STREET (left of parking lot) ── */}
            <rect
              x="0"
              y={ROAD_TOP - 8}
              width={PARK_LEFT}
              height="8"
              fill="#94a3b8"
              opacity="0.6"
            />
            <rect
              x="0"
              y={ROAD_TOP}
              width={PARK_LEFT}
              height={ROAD_BOTTOM - ROAD_TOP}
              fill="#64748b"
            />
            <rect
              x="0"
              y={ROAD_BOTTOM}
              width={PARK_LEFT}
              height="8"
              fill="#94a3b8"
              opacity="0.6"
            />
            {[...Array(6)].map((_, i) => (
              <rect
                key={`ed${i}`}
                x={i * 40 + 10}
                y={LANE_Y - 1}
                width="22"
                height="3"
                rx="1.5"
                fill="#e2e8f0"
                opacity="0.8"
              />
            ))}
            <polygon
              points={`60,${LANE_Y - 8} 73,${LANE_Y} 60,${LANE_Y + 8}`}
              fill="#fff"
              opacity="0.6"
            />
            <polygon
              points={`100,${LANE_Y - 8} 113,${LANE_Y} 100,${LANE_Y + 8}`}
              fill="#fff"
              opacity="0.45"
            />
            <text
              x="20"
              y={LANE_Y + 22}
              fill="#1e40af"
              fontSize="8"
              fontFamily="'Space Grotesk',sans-serif"
              opacity="0.8"
              fontWeight="700"
            >
              ENTRÉE →
            </text>

            {/* ── EXIT STREET (right of parking lot) ── */}
            <rect
              x={PARK_RIGHT}
              y={ROAD_TOP - 8}
              width={VB_W - PARK_RIGHT}
              height="8"
              fill="#94a3b8"
              opacity="0.6"
            />
            <rect
              x={PARK_RIGHT}
              y={ROAD_TOP}
              width={VB_W - PARK_RIGHT}
              height={ROAD_BOTTOM - ROAD_TOP}
              fill="#64748b"
            />
            <rect
              x={PARK_RIGHT}
              y={ROAD_BOTTOM}
              width={VB_W - PARK_RIGHT}
              height="8"
              fill="#94a3b8"
              opacity="0.6"
            />
            {[...Array(6)].map((_, i) => (
              <rect
                key={`xd${i}`}
                x={PARK_RIGHT + i * 40 + 10}
                y={LANE_Y - 1}
                width="22"
                height="3"
                rx="1.5"
                fill="#e2e8f0"
                opacity="0.8"
              />
            ))}
            <polygon
              points={`${PARK_RIGHT + 140},${LANE_Y - 8} ${PARK_RIGHT + 153},${LANE_Y} ${PARK_RIGHT + 140},${LANE_Y + 8}`}
              fill="#fff"
              opacity="0.6"
            />
            <polygon
              points={`${PARK_RIGHT + 170},${LANE_Y - 8} ${PARK_RIGHT + 183},${LANE_Y} ${PARK_RIGHT + 170},${LANE_Y + 8}`}
              fill="#fff"
              opacity="0.45"
            />
            <text
              x={VB_W - 70}
              y={LANE_Y + 22}
              fill="#991b1b"
              fontSize="8"
              fontFamily="'Space Grotesk',sans-serif"
              opacity="0.8"
              fontWeight="700"
            >
              SORTIE →
            </text>

            {/* ── PARKING LOT STRUCTURE ── */}
            {/* Top parking zone (above aisle) */}
            <rect
              x={PARK_LEFT}
              y={PARK_TOP}
              width={PARK_RIGHT - PARK_LEFT}
              height={ROAD_TOP - PARK_TOP}
              rx="6"
              fill="#cbd5e1"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            {/* Bottom parking zone (below aisle) */}
            <rect
              x={PARK_LEFT}
              y={ROAD_BOTTOM}
              width={PARK_RIGHT - PARK_LEFT}
              height={PARK_BOTTOM - ROAD_BOTTOM}
              rx="6"
              fill="#cbd5e1"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            {/* Zone label */}
            <text
              x={(PARK_LEFT + PARK_RIGHT) / 2}
              y={PARK_TOP + 11}
              textAnchor="middle"
              fill="#475569"
              fontSize="9"
              fontFamily="'Space Grotesk',sans-serif"
              letterSpacing="2"
              fontWeight="700"
            >
              ZONE PARKING
            </text>
            {/* Drive aisle through parking (connects entry & exit streets) */}
            <rect
              x={PARK_LEFT}
              y={ROAD_TOP}
              width={PARK_RIGHT - PARK_LEFT}
              height={ROAD_BOTTOM - ROAD_TOP}
              fill="#64748b"
            />
            {/* Aisle center dashes */}
            {[...Array(7)].map((_, i) => (
              <rect
                key={`ad${i}`}
                x={PARK_LEFT + 10 + i * 42}
                y={LANE_Y - 1}
                width="22"
                height="3"
                rx="1.5"
                fill="#e2e8f0"
                opacity="0.7"
              />
            ))}

            {/* Parking spots */}
            {SPOTS.map((s, i) => {
              const occupied = parkedCars[i];
              return (
                <g key={i}>
                  <rect
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    rx="3"
                    fill={occupied ? "#e0e7ff" : "#e2e8f0"}
                    stroke={occupied ? "#3b82f6" : "#94a3b8"}
                    strokeWidth="1.5"
                  />
                  {/* Spot number */}
                  {!occupied && (
                    <text
                      x={s.x + s.w / 2}
                      y={s.y + s.h - 6}
                      textAnchor="middle"
                      fill="#1e3a5f"
                      fontSize="8"
                      fontFamily="'Space Grotesk',sans-serif"
                    >
                      {i + 1}
                    </text>
                  )}
                  {/* Mini top-down car in spot */}
                  {occupied && (
                    <g transform={`translate(${s.x + 2},${s.y + 2})`}>
                      <rect
                        width={s.w - 4}
                        height={s.h - 4}
                        rx="3"
                        fill={CAT_COLOR[occupied.category] || "#38bdf8"}
                        opacity="0.75"
                      />
                      <rect
                        x="4"
                        y="4"
                        width={s.w - 12}
                        height="10"
                        rx="2"
                        fill="#bfdbfe"
                        opacity="0.5"
                      />
                      <rect
                        x="4"
                        y={s.h - 18}
                        width={s.w - 12}
                        height="8"
                        rx="2"
                        fill="#bfdbfe"
                        opacity="0.35"
                      />
                      <rect
                        x="1"
                        y="5"
                        width="4"
                        height="6"
                        rx="1"
                        fill="#1e293b"
                      />
                      <rect
                        x={s.w - 7}
                        y="5"
                        width="4"
                        height="6"
                        rx="1"
                        fill="#1e293b"
                      />
                      <rect
                        x="1"
                        y={s.h - 14}
                        width="4"
                        height="6"
                        rx="1"
                        fill="#1e293b"
                      />
                      <rect
                        x={s.w - 7}
                        y={s.h - 14}
                        width="4"
                        height="6"
                        rx="1"
                        fill="#1e293b"
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {/* ── ENTRY GATE (left boundary at road level) ── */}
            <rect
              x={PARK_LEFT - 3}
              y={ROAD_TOP - 3}
              width="6"
              height={ROAD_BOTTOM - ROAD_TOP + 6}
              rx="2"
              fill="#64748b"
            />
            <rect
              x={PARK_LEFT + 3}
              y={ROAD_TOP + 4}
              width="4"
              height={entryState === "idle" ? ROAD_BOTTOM - ROAD_TOP - 8 : 8}
              rx="2"
              fill={entryState === "idle" ? "#ef4444" : "#22c55e"}
              opacity="0.8"
              style={{ transition: "all 0.4s ease" }}
            />
            <rect
              x={PARK_LEFT - 28}
              y={ROAD_TOP - 18}
              width="56"
              height="14"
              rx="3"
              fill="#166534"
              opacity="0.95"
            />
            <text
              x={PARK_LEFT}
              y={ROAD_TOP - 8}
              textAnchor="middle"
              fill="#bbf7d0"
              fontSize="7.5"
              fontFamily="'Space Grotesk',sans-serif"
              fontWeight="700"
              letterSpacing="1"
            >
              ENTRÉE
            </text>

            {/* ── ENTRY CAMERA (on entry street) ── */}
            <rect
              x={ENTRY_CAM_X - 1}
              y={ROAD_TOP - 30}
              width="2"
              height="30"
              fill="#64748b"
            />
            <rect
              x={ENTRY_CAM_X - 14}
              y={ROAD_TOP - 50}
              width="26"
              height="18"
              rx="4"
              fill={entrySig.cam ? "#1e40af" : "#475569"}
              stroke={entrySig.cam ? "#3b82f6" : "#94a3b8"}
              strokeWidth={entrySig.cam ? 2 : 1}
            />
            <circle
              cx={ENTRY_CAM_X}
              cy={ROAD_TOP - 41}
              r="5"
              fill={entrySig.cam ? "#3b82f6" : "#94a3b8"}
            />
            {entrySig.cam && (
              <circle
                cx={ENTRY_CAM_X}
                cy={ROAD_TOP - 41}
                r="8"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                opacity="0.4"
                style={{ animation: "glow 1s infinite" }}
              />
            )}
            <text
              x={ENTRY_CAM_X}
              y={ROAD_TOP - 32}
              textAnchor="middle"
              fill="#334155"
              fontSize="7"
              fontFamily="'Space Grotesk',sans-serif"
            >
              CAM-E
            </text>
            {entrySig.cam && (
              <line
                x1={ENTRY_CAM_X}
                y1={ROAD_TOP - 50}
                x2={ENTRY_CAM_X}
                y2={1}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="6,4"
                style={{ animation: "dash 0.4s linear infinite" }}
              />
            )}

            {/* ── EXIT GATE (right boundary at road level) ── */}
            <rect
              x={PARK_RIGHT - 3}
              y={ROAD_TOP - 3}
              width="6"
              height={ROAD_BOTTOM - ROAD_TOP + 6}
              rx="2"
              fill="#64748b"
            />
            <rect
              x={PARK_RIGHT - 7}
              y={ROAD_TOP + 4}
              width="4"
              height={exitState === "idle" ? ROAD_BOTTOM - ROAD_TOP - 8 : 8}
              rx="2"
              fill={exitState === "idle" ? "#ef4444" : "#22c55e"}
              opacity="0.8"
              style={{ transition: "all 0.4s ease" }}
            />
            <rect
              x={PARK_RIGHT - 28}
              y={ROAD_TOP - 18}
              width="56"
              height="14"
              rx="3"
              fill="#991b1b"
              opacity="0.95"
            />
            <text
              x={PARK_RIGHT}
              y={ROAD_TOP - 8}
              textAnchor="middle"
              fill="#fecaca"
              fontSize="7.5"
              fontFamily="'Space Grotesk',sans-serif"
              fontWeight="700"
              letterSpacing="1"
            >
              SORTIE
            </text>

            {/* ── EXIT CAMERA (on exit street) ── */}
            <rect
              x={EXIT_CAM_X - 1}
              y={ROAD_TOP - 30}
              width="2"
              height="30"
              fill="#64748b"
            />
            <rect
              x={EXIT_CAM_X - 14}
              y={ROAD_TOP - 50}
              width="26"
              height="18"
              rx="4"
              fill={exitSig.cam ? "#991b1b" : "#475569"}
              stroke={exitSig.cam ? "#ef4444" : "#94a3b8"}
              strokeWidth={exitSig.cam ? 2 : 1}
            />
            <circle
              cx={EXIT_CAM_X}
              cy={ROAD_TOP - 41}
              r="5"
              fill={exitSig.cam ? "#ef4444" : "#94a3b8"}
            />
            {exitSig.cam && (
              <circle
                cx={EXIT_CAM_X}
                cy={ROAD_TOP - 41}
                r="8"
                fill="none"
                stroke="#fb7185"
                strokeWidth="1.5"
                opacity="0.4"
                style={{ animation: "glow 1s infinite" }}
              />
            )}
            <text
              x={EXIT_CAM_X}
              y={ROAD_TOP - 32}
              textAnchor="middle"
              fill="#334155"
              fontSize="7"
              fontFamily="'Space Grotesk',sans-serif"
            >
              CAM-S
            </text>
            {exitSig.cam && (
              <line
                x1={EXIT_CAM_X}
                y1={ROAD_TOP - 50}
                x2={EXIT_CAM_X}
                y2={1}
                stroke="#fb7185"
                strokeWidth="2"
                strokeDasharray="6,4"
                style={{ animation: "dash 0.4s linear infinite" }}
              />
            )}

            {/* ── ENTRY CAR (moves right along ENTRY_LANE_Y) ── */}
            {entryState !== "idle" && (
              <g transform={`translate(${entryX - 10}, ${ENTRY_LANE_Y - 18})`}>
                {/* Car shadow */}
                <ellipse
                  cx="10"
                  cy="34"
                  rx="10"
                  ry="4"
                  fill="#000"
                  opacity="0.25"
                />
                {/* Top-down car body */}
                <rect
                  x="0"
                  y="2"
                  width="20"
                  height="32"
                  rx="4"
                  fill={pendingCar ? CAT_COLOR[pendingCar.category] : "#38bdf8"}
                />
                <rect
                  x="3"
                  y="0"
                  width="14"
                  height="10"
                  rx="3"
                  fill={pendingCar ? CAT_COLOR[pendingCar.category] : "#38bdf8"}
                  opacity="0.85"
                />
                <rect
                  x="4"
                  y="2"
                  width="12"
                  height="7"
                  rx="2"
                  fill="#bfdbfe"
                  opacity="0.7"
                />
                <rect
                  x="4"
                  y="23"
                  width="12"
                  height="6"
                  rx="2"
                  fill="#bfdbfe"
                  opacity="0.45"
                />
                <rect x="-2" y="5" width="4" height="6" rx="1" fill="#1e293b" />
                <rect x="18" y="5" width="4" height="6" rx="1" fill="#1e293b" />
                <rect
                  x="-2"
                  y="23"
                  width="4"
                  height="6"
                  rx="1"
                  fill="#1e293b"
                />
                <rect
                  x="18"
                  y="23"
                  width="4"
                  height="6"
                  rx="1"
                  fill="#1e293b"
                />
                <rect
                  x="3"
                  y="0"
                  width="5"
                  height="2"
                  rx="1"
                  fill="#fde68a"
                  opacity="0.9"
                />
                <rect
                  x="12"
                  y="0"
                  width="5"
                  height="2"
                  rx="1"
                  fill="#fde68a"
                  opacity="0.9"
                />
              </g>
            )}

            {/* ── EXIT CAR (moves right along EXIT_LANE_Y) ── */}
            {exitState !== "idle" && (
              <g transform={`translate(${exitX - 10}, ${EXIT_LANE_Y - 18})`}>
                <ellipse
                  cx="10"
                  cy="34"
                  rx="10"
                  ry="4"
                  fill="#000"
                  opacity="0.25"
                />
                <rect
                  x="0"
                  y="2"
                  width="20"
                  height="32"
                  rx="4"
                  fill={exitingCar ? CAT_COLOR[exitingCar.category] : "#fb7185"}
                />
                <rect
                  x="3"
                  y="0"
                  width="14"
                  height="10"
                  rx="3"
                  fill={exitingCar ? CAT_COLOR[exitingCar.category] : "#fb7185"}
                  opacity="0.85"
                />
                <rect
                  x="4"
                  y="2"
                  width="12"
                  height="7"
                  rx="2"
                  fill="#bfdbfe"
                  opacity="0.7"
                />
                <rect
                  x="4"
                  y="23"
                  width="12"
                  height="6"
                  rx="2"
                  fill="#bfdbfe"
                  opacity="0.45"
                />
                <rect x="-2" y="5" width="4" height="6" rx="1" fill="#1e293b" />
                <rect x="18" y="5" width="4" height="6" rx="1" fill="#1e293b" />
                <rect
                  x="-2"
                  y="23"
                  width="4"
                  height="6"
                  rx="1"
                  fill="#1e293b"
                />
                <rect
                  x="18"
                  y="23"
                  width="4"
                  height="6"
                  rx="1"
                  fill="#1e293b"
                />
                <rect
                  x="3"
                  y="0"
                  width="5"
                  height="2"
                  rx="1"
                  fill="#fde68a"
                  opacity="0.9"
                />
                <rect
                  x="12"
                  y="0"
                  width="5"
                  height="2"
                  rx="1"
                  fill="#fde68a"
                  opacity="0.9"
                />
              </g>
            )}
          </svg>

          {/* ── ALPR PROCESSING BOXES (overlay) ── */}
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
              zIndex: 10,
            }}
          >
            {/* DÉTECTION — shows the plate photo */}
            <div
              style={{
                background: entrySig.det
                  ? "rgba(14,165,233,0.18)"
                  : T.alprBoxBg,
                border: `1.5px solid ${entrySig.det ? "#38bdf8" : T.alprBorder}`,
                borderRadius: 8,
                padding: "6px 12px",
                minWidth: 130,
                boxShadow: entrySig.det
                  ? "0 0 14px rgba(56,189,248,0.3)"
                  : "none",
                transition: "all 0.35s",
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  color: entrySig.det ? "#7dd3fc" : T.alprLabel,
                  letterSpacing: 1,
                  marginBottom: 3,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                🔍 DÉTECTION
              </div>
              {entrySig.det && entryBox.plateImg ? (
                <img
                  src={entryBox.plateImg}
                  alt="plate"
                  style={{
                    width: "100%",
                    maxHeight: 40,
                    objectFit: "contain",
                    borderRadius: 4,
                    border: "1px solid #38bdf8",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: 10.5,
                    color: entrySig.det ? "#e2e8f0" : T.alprText,
                    fontWeight: 700,
                    minHeight: 15,
                  }}
                >
                  {entrySig.det ? "Véhicule ✓" : "STANDBY"}
                </div>
              )}
            </div>

            {/* LOCALISATION — shows plate photo cropped / highlighted */}
            <div
              style={{
                background: entrySig.loc
                  ? "rgba(14,165,233,0.18)"
                  : T.alprBoxBg,
                border: `1.5px solid ${entrySig.loc ? "#38bdf8" : T.alprBorder}`,
                borderRadius: 8,
                padding: "6px 12px",
                minWidth: 130,
                boxShadow: entrySig.loc
                  ? "0 0 14px rgba(56,189,248,0.3)"
                  : "none",
                transition: "all 0.35s",
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  color: entrySig.loc ? "#7dd3fc" : T.alprLabel,
                  letterSpacing: 1,
                  marginBottom: 3,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                📍 LOCALISATION
              </div>
              {entrySig.loc && entryBox.plateImg ? (
                <div
                  style={{
                    position: "relative",
                    border: "2px solid #22c55e",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={entryBox.plateImg}
                    alt="plate-loc"
                    style={{
                      width: "100%",
                      maxHeight: 40,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: "2px dashed #22c55e",
                      borderRadius: 2,
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 10.5,
                    color: entrySig.loc ? "#e2e8f0" : T.alprText,
                    fontWeight: 700,
                    minHeight: 15,
                  }}
                >
                  {entrySig.loc ? "Plaque ✓" : "STANDBY"}
                </div>
              )}
            </div>

            {/* OCR — shows the recognized plate text */}
            <div
              style={{
                background: entrySig.ocr
                  ? "rgba(14,165,233,0.18)"
                  : T.alprBoxBg,
                border: `1.5px solid ${entrySig.ocr ? "#38bdf8" : T.alprBorder}`,
                borderRadius: 8,
                padding: "6px 12px",
                minWidth: 130,
                boxShadow: entrySig.ocr
                  ? "0 0 14px rgba(56,189,248,0.3)"
                  : "none",
                transition: "all 0.35s",
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  color: entrySig.ocr ? "#7dd3fc" : T.alprLabel,
                  letterSpacing: 1,
                  marginBottom: 3,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                🔤 OCR / LECTURE
              </div>
              <div
                style={{
                  fontSize: entrySig.ocr ? 13 : 10.5,
                  color: entrySig.ocr ? "#e2e8f0" : T.alprText,
                  fontWeight: 700,
                  minHeight: 15,
                  direction: "rtl",
                  fontFamily: "'Space Grotesk',sans-serif",
                  letterSpacing: 0.5,
                }}
              >
                {entrySig.ocr ? entryBox.ocr || "..." : "STANDBY"}
              </div>
              {entrySig.ocr && pendingCar && (
                <div style={{ fontSize: 9, color: "#7dd3fc", marginTop: 2 }}>
                  {pendingCar.model} · {pendingCar.category}
                </div>
              )}
            </div>
          </div>

          {/* Status pill */}
          {(entryState !== "idle" || exitState !== "idle") && (
            <div
              style={{
                position: "absolute",
                bottom: 8,
                right: 12,
                background:
                  entryState === "denied"
                    ? "rgba(239,68,68,0.2)"
                    : entryState !== "idle"
                      ? "rgba(56,189,248,0.15)"
                      : "rgba(251,113,133,0.15)",
                border: `1px solid ${entryState === "denied" ? "#ef4444" : entryState !== "idle" ? "#38bdf8" : "#fb7185"}`,
                borderRadius: 20,
                padding: "3px 12px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1,
                color:
                  entryState === "denied"
                    ? "#ef4444"
                    : entryState !== "idle"
                      ? "#38bdf8"
                      : "#fb7185",
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              ●{" "}
              {entryState !== "idle"
                ? entryState === "moving"
                  ? "VÉHICULE EN APPROCHE"
                  : entryState === "parking"
                    ? "ACCÈS ACCORDÉ — PARKING..."
                    : entryState === "denied"
                      ? "🚫 ACCÈS REFUSÉ — MARCHE ARRIÈRE"
                      : "TRAITEMENT ALPR..."
                : exitState === "moving"
                  ? "SORTIE EN COURS"
                  : "SCAN SORTIE..."}
            </div>
          )}

          {/* Access decision alert banner */}
          {accessAlert && (
            <div
              style={{
                position: "absolute",
                bottom: 32,
                left: "50%",
                transform: "translateX(-50%)",
                background: accessAlert.allowed
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(239,68,68,0.2)",
                border: `2px solid ${accessAlert.allowed ? "#22c55e" : "#ef4444"}`,
                borderRadius: 12,
                padding: "8px 18px",
                maxWidth: 420,
                textAlign: "center",
                backdropFilter: "blur(6px)",
                zIndex: 20,
                animation: "fadeIn 0.3s ease",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: accessAlert.allowed ? "#22c55e" : "#ef4444",
                  fontFamily: "'Space Grotesk',sans-serif",
                  letterSpacing: 0.5,
                  marginBottom: 2,
                }}
              >
                {accessAlert.allowed ? "ACCÈS AUTORISÉ" : "ACCÈS REFUSÉ"}
              </div>
              <div style={{ fontSize: 10, color: T.text, lineHeight: 1.4 }}>
                {accessAlert.reason}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: T.textSec,
                  marginTop: 2,
                  direction: "rtl",
                }}
              >
                Plaque: {accessAlert.plate}
              </div>
            </div>
          )}
        </div>

        {/* ── BUTTONS ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 18px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
            alignItems: "center",
            flexWrap: "wrap",
            background: T.bg,
            transition: "background 0.3s",
          }}
        >
          <button
            className="btn-entry"
            onClick={runEntry}
            disabled={entryState !== "idle" || exitState !== "idle"}
            style={{
              background:
                entryState !== "idle" || exitState !== "idle"
                  ? T.btnDisabledBg
                  : "#0ea5e9",
              border: "none",
              borderRadius: 0,
              padding: "9px 20px",
              color:
                entryState !== "idle" || exitState !== "idle"
                  ? T.btnDisabledText
                  : "#fff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor:
                entryState !== "idle" || exitState !== "idle"
                  ? "not-allowed"
                  : "pointer",
              fontFamily: "'Space Grotesk',sans-serif",
              boxShadow:
                entryState !== "idle" || exitState !== "idle"
                  ? "none"
                  : "0 0 16px rgba(14,165,233,0.3)",
            }}
          >
            {entryState !== "idle"
              ? "⏳ TRAITEMENT EN COURS..."
              : "🚗 ENVOYER UN VÉHICULE"}
          </button>

          <div style={{ width: 1, height: 30, background: T.border }} />

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.textSec,
              fontFamily: "'Space Grotesk',sans-serif",
              letterSpacing: 0.5,
            }}
          >
            🚪 Faire sortir véhicule :
          </span>

          {parkedCars.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: T.textDimmer,
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              Aucun véhicule garé
            </span>
          ) : (
            parkedCars.map((car) => (
              <button
                key={car.id}
                className="exit-btn"
                onClick={() => runExit(car.id)}
                disabled={exitState !== "idle" || entryState !== "idle"}
                style={{
                  background: T.exitBtnBg,
                  border: `1px solid ${T.exitBtnBorder}`,
                  borderRadius: 0,
                  padding: "6px 12px",
                  color: T.exitBtnText,
                  fontSize: 10,
                  cursor:
                    exitState !== "idle" || entryState !== "idle"
                      ? "not-allowed"
                      : "pointer",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: CAT_COLOR[car.category],
                    display: "inline-block",
                  }}
                />
                🚪 {car.plate}
              </button>
            ))
          )}
        </div>

        {/* ── JOURNAL ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 18px",
            background: T.bg,
            transition: "background 0.3s",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: T.textDim,
              marginBottom: 10,
              fontFamily: "'Space Grotesk',sans-serif",
            }}
          >
            📋 JOURNAL DU PARKING
          </div>

          {cars.length === 0 ? (
            <div
              style={{
                color: T.noEventText,
                textAlign: "center",
                padding: "30px 0",
                fontSize: 13,
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              Aucun événement enregistré — cliquez sur "Envoyer un véhicule"
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `2px solid ${T.border}`,
                    background: dark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.05)",
                  }}
                >
                  {[
                    "Plaque",
                    "Modèle",
                    "Catégorie",
                    "Entrée",
                    "Sortie",
                    "Durée",
                    "Tarif",
                    "Statut",
                    "Décision",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 14px",
                        color: T.text,
                        fontWeight: 700,
                        fontFamily: "'Space Grotesk',sans-serif",
                        letterSpacing: 0.5,
                        textAlign: "left",
                        fontSize: 11,
                        borderRight: `1px solid ${T.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cars
                  .slice()
                  .reverse()
                  .map((car, i) => (
                    <tr
                      key={car.id}
                      style={{
                        background: i % 2 === 0 ? T.rowAlt : "transparent",
                        borderBottom: `1px solid ${T.border}`,
                        animation: "fadeIn 0.3s ease",
                      }}
                    >
                      <td
                        style={{
                          padding: "9px 14px",
                          fontWeight: 700,
                          color: T.plateText,
                          fontSize: 12,
                          letterSpacing: 0.3,
                          direction: "rtl",
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        {car.plate}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: T.textSec,
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        {car.model}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 9px",
                            borderRadius: 2,
                            fontSize: 9.5,
                            fontWeight: 700,
                            background: `${CAT_COLOR[car.category]}1a`,
                            color: CAT_COLOR[car.category],
                            border: `1px solid ${CAT_COLOR[car.category]}44`,
                            fontFamily: "'Space Grotesk',sans-serif",
                          }}
                        >
                          {car.category}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: T.entryTime,
                          fontSize: 11,
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        {car.entry}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: T.entryTime,
                          fontSize: 11,
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        {car.exit || "—"}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: T.textSec,
                          fontSize: 11,
                          borderRight: `1px solid ${T.border}`,
                          fontFamily: "'Space Grotesk',sans-serif",
                        }}
                      >
                        {(() => {
                          const t = calcTariff(car);
                          return t.duration;
                        })()}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        {(() => {
                          const t = calcTariff(car);
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                  t.tariff === "Gratuit"
                                    ? "#4ade80"
                                    : "#fbbf24",
                                fontFamily: "'Space Grotesk',sans-serif",
                              }}
                            >
                              {t.tariff}
                              {t.overstay && (
                                <span
                                  style={{
                                    color: "#ef4444",
                                    marginLeft: 4,
                                    fontSize: 9,
                                  }}
                                >
                                  ⚠ DÉPASSEMENT
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color:
                              car.status === "Garé"
                                ? "#4ade80"
                                : car.status === "Refusé"
                                  ? "#ef4444"
                                  : T.statusSorti,
                          }}
                        >
                          {car.status === "Garé"
                            ? "● Garé"
                            : car.status === "Refusé"
                              ? "⛔ Refusé"
                              : "○ Sorti"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          maxWidth: 140,
                          borderRight: `1px solid ${T.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color:
                              car.decision?.allowed === false
                                ? "#fca5a5"
                                : T.textSec,
                            fontFamily: "'Space Grotesk',sans-serif",
                            lineHeight: 1.3,
                            display: "block",
                          }}
                        >
                          {car.decision?.reason || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <button
                          className="ask-btn"
                          onClick={() => askAboutCar(car)}
                          style={{
                            background: T.askBtnBg,
                            border: `1px solid ${T.askBtnBorder}`,
                            borderRadius: 0,
                            padding: "3px 9px",
                            color: T.askBtnText,
                            fontSize: 9.5,
                            cursor: "pointer",
                            fontFamily: "'Space Grotesk',sans-serif",
                            fontWeight: 600,
                          }}
                        >
                          💬 Demander
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT — CHATBOT ═══════════ */}
      <div
        style={{
          width: 360,
          background: T.bg2,
          borderLeft: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          transition: "background 0.3s",
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 0,
                background: "#6366f1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              🤖
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: T.text,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                Assistant Tunis Park
              </div>
              <div style={{ fontSize: 9.5, color: T.chatSubtext }}>
                RAG · Règlements + Logs temps réel
              </div>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#22c55e",
                }}
              />
              <span
                style={{ fontSize: 9, color: T.onlineText, fontWeight: 600 }}
              >
                mistralai-small-3.1-24b
              </span>
            </div>
          </div>

          {/* Uploaded docs badges */}
          {uploadedDocs.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 8,
              }}
            >
              {uploadedDocs.map((doc, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 8.5,
                    background: dark
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(34,197,94,0.1)",
                    color: "#22c55e",
                    border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: 10,
                    padding: "2px 8px",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  📄 {doc.name}
                  <span
                    onClick={() =>
                      setUploadedDocs((prev) => prev.filter((_, j) => j !== i))
                    }
                    style={{ cursor: "pointer", fontSize: 10, marginLeft: 2 }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                background: msg.role === "user" ? T.chatUser : T.chatBot,
                border: `1px solid ${msg.role === "user" ? T.chatUserBorder : T.border}`,
                borderRadius:
                  msg.role === "user"
                    ? "12px 12px 2px 12px"
                    : "12px 12px 12px 2px",
                padding: "9px 12px",
                fontSize: 12,
                lineHeight: 1.6,
                color: msg.role === "user" ? T.chatUserText : T.chatBotText,
                whiteSpace: "pre-wrap",
                animation: "fadeIn 0.2s ease",
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                background: T.chatBot,
                border: `1px solid ${T.border}`,
                borderRadius: "12px 12px 12px 2px",
                padding: "9px 14px",
                fontSize: 12,
                color: T.textDim,
              }}
            >
              Analyse<span style={{ animation: "blink 1s infinite" }}>...</span>
            </div>
          )}
        </div>

        {/* Quick questions */}
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {[
            { q: "💰 Tarif visiteur?", c: "#0ea5e9" },
            { q: "🚗 Véhicules garés?", c: "#22c55e" },
            { q: "⭐ Règles VIP?", c: "#f59e0b" },
            { q: "🚨 Plaque volée?", c: "#ef4444" },
          ].map(({ q, c }) => (
            <button
              key={q}
              onClick={() => setInput(q)}
              style={{
                background: `${c}22`,
                border: `1.5px solid ${c}66`,
                borderRadius: 0,
                padding: "6px 14px",
                color: c,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 700,
                letterSpacing: 0.3,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${c}33`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `${c}22`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input + Upload */}
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.xml,.log,.pdf,.doc,.docx"
            onChange={handleDocUpload}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Uploader un document pour le RAG"
            style={{
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 0,
              padding: "8px 10px",
              cursor: "pointer",
              fontSize: 15,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.2s",
              color: T.textSec,
            }}
          >
            📎
          </button>
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Posez votre question..."
            style={{
              flex: 1,
              background: T.inputBg,
              border: `1.5px solid ${T.border}`,
              borderRadius: 0,
              padding: "9px 13px",
              color: T.text,
              fontSize: 12,
              fontFamily: "'Inter',sans-serif",
              outline: "none",
              transition: "border-color 0.2s, background 0.3s",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{
              background: loading ? T.btnDisabledBg : "#6366f1",
              border: "none",
              borderRadius: 0,
              padding: "9px 16px",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15,
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
