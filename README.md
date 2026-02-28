# Smart Park TN Simulation

A lightweight **React/Vite** application that simulates an automated parking lot using
artificial license plate recognition (ALPR). The project was developed as an
interactive demo that combines SVG animation, state‑driven business logic, and a
chatbot powered by OpenRouter for rule‑based reasoning.

[![Demo]()](https://drive.google.com/file/d/1i7v_YjxpWw2cNqxnOSFwAmsCH9BARrg3/view?usp=drive_link))
[![Live Link]()](https://smart-park-bamx.onrender.com))

## 🚗 Key Featur

- **Entry/Exit Simulation** using SVG vehicles that drive in/out of a parking
  area.
- **Real license plate images** mapped to Tunisian plate numbers; OCR text is
  displayed beside each car.
- **Editable blacklists, abonnés and autorisés** lists with intuitive header
  controls.
- **Access decision engine** that classifies cars (VIP, Abonné, Personnel,
  Autorisé, Visiteur, Bloqué) and applies corresponding rules.
- **Tariff calculator**: visitors pay **1 TND/min**; personnel/autorisé free 7h–19h
  otherwise 1 TND/hr; abonnés & VIP always free.
- **Dark/light mode toggle** and daylight theme in SVG scene.
- **Chatbot for parking rules** leveraging an OpenRouter GPT-4o-mini model with
  retrieved context from a local knowledge base and uploaded documents.
- **30‑second clock tick** to update parked duration in real time.

## 🛠️ Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/<your-username>/Smart-Park.git
   cd Smart-Park/alpr-sim
   ```

2. Install dependencies and start the development server:

   ```bash
   npm install
   npm run dev
   ```

   The app will be available at `http://localhost:5173` by default.

3. Build for production:
   ```bash
   npm run build
   ```

## 📝 Usage Notes

- Use the header buttons to add/remove plate numbers from the three lists.
- Click **Entrée** / **Sortie** to simulate a vehicle arriving or leaving.
- The chatbot at the bottom can answer questions about parking rules; drop a
  document to augment its knowledge.
- All interactions are purely client‑side; there is no backend server.

## 📁 Project Structure

```
alpr-sim/
  ├─ public/           # static assets including plate images
  ├─ src/App.jsx       # single-file React app (primary logic/UI)
  ├─ package.json      # dependencies and scripts
  ├─ vite.config.js    # Vite configuration
  └─ README.md         # this file
```

## 🧩 Customization

You can modify `src/App.jsx` to:

- Add more plate images to `PLATE_MAP` and update `public/plates`.
- Change tariff rules or list behaviors.
- Expand the chatbot prompt or integrate a different LLM API.

## 📜 License

This project is released under the [MIT License](LICENSE).

---

> Developed by Rahim Farhat (or appropriate author) for demonstration
> purposes. Feel free to fork and adapt!


