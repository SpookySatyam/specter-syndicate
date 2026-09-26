# Specter Syndicate

A stealth-action isometric web game built with **React**, **Three.js**, and **React Three Fiber**.

## Overview

**Specter Syndicate** plunges you into a shadowy, isometric world where stealth is your greatest weapon. Navigate your player through a beautifully lit, atmospheric environment while evading AI-controlled hunters patrolling the area. 

The game utilizes a reactive game loop architecture, allowing the 3D rendering engine (R3F) to run at high performance while updating the 2D React DOM (Heads Up Display) efficiently without causing unnecessary re-renders.

## Features

- **Isometric 3D Graphics**: Built using `@react-three/fiber` and `@react-three/drei` for an immersive orthographic perspective.
- **Stealth Mechanics**: Weave between patrol routes (Hunters) and manage your detection state and health.
- **Optimized Game Loop**: Custom state management (`gameState.js`) bridging the R3F `useFrame` loop and the React UI for high performance.
- **Dynamic Lighting & Shadows**: Atmospheric lighting with directional shadows and fog for a moody aesthetic.

## Technology Stack

- **Core**: React 19, Vite
- **3D Engine**: Three.js, React Three Fiber, React Three Drei
- **Styling**: Vanilla CSS

## Getting Started

### Prerequisites

- Node.js installed on your machine.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the local URL provided by Vite (e.g., http://localhost:5173).

## Controls

*(Configured via `src/useKeyboardControls.js`, typically WASD or Arrow keys for movement).* 

## Project Structure

- `src/App.jsx` - Main application entry point handling scene remounts.
- `src/Scene.jsx` - The main 3D scene holding the environment, player, and hunters.
- `src/Player.jsx` & `src/Hunter.jsx` - The game entities and their behaviors.
- `src/gameState.js` - Singleton bridging the high-frequency R3F game loop to the React DOM HUD.
- `src/HUD.jsx` - The 2D user interface displaying health and stealth status.
