import { router } from 'expo-router';
import { api } from './session.tsx';
import { chooseSemester } from './currentSemester.ts';

export const startAndOpen = async (timetableId: number) => {
  await api.startTracking(timetableId);
  await chooseSemester(timetableId);
  router.dismissTo('/');
};

export const isSetup = (value: string | string[] | undefined) => value === '1';
