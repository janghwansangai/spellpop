import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { PublicRoomState, GameOverPayload } from '../types';

interface GameStore {
  socket: Socket | null;
  setSocket: (socket: Socket | null) => void;

  nickname: string;
  setNickname: (name: string) => void;

  roomState: PublicRoomState | null;
  setRoomState: (state: PublicRoomState | null) => void;

  finalResult: GameOverPayload | null;
  setFinalResult: (result: GameOverPayload | null) => void;

  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  socket: null,
  setSocket: (socket) => set({ socket }),

  nickname: '',
  setNickname: (nickname) => set({ nickname }),

  roomState: null,
  setRoomState: (roomState) => set({ roomState }),

  finalResult: null,
  setFinalResult: (finalResult) => set({ finalResult }),

  resetGame: () => set({ roomState: null, finalResult: null })
}));
