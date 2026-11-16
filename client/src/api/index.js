// One function per API endpoint, grouped by resource. Components call these instead of
// building URLs themselves, so every path lives in one file.
import { request } from './client';

export const api = {
  auth: {
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    me: () => request('/auth/me'),
  },

  summary: {
    daily: (date) => request('/summary/daily', { query: { date } }),
    trends: (query) => request('/summary/trends', { query }),
  },

  exercises: {
    list: (query) => request('/exercises', { query }),
    create: (body) => request('/exercises', { method: 'POST', body }),
  },

  workouts: {
    list: (query) => request('/workouts', { query }),
    create: (body) => request('/workouts', { method: 'POST', body }),
    update: (id, body) => request(`/workouts/${id}`, { method: 'PUT', body }),
    remove: (id) => request(`/workouts/${id}`, { method: 'DELETE' }),
    personalBests: () => request('/workouts/personal-bests'),
  },

  events: {
    list: (query) => request('/events', { query }),
    create: (body, { allowOverlap = false } = {}) =>
      request('/events', { method: 'POST', body, query: { allowOverlap } }),
    update: (id, body, { allowOverlap = false } = {}) =>
      request(`/events/${id}`, { method: 'PUT', body, query: { allowOverlap } }),
    remove: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  },

  foodEntries: {
    list: (query) => request('/food-entries', { query }),
    create: (body) => request('/food-entries', { method: 'POST', body }),
    update: (id, body) => request(`/food-entries/${id}`, { method: 'PUT', body }),
    remove: (id) => request(`/food-entries/${id}`, { method: 'DELETE' }),
  },

  goals: {
    current: (date) => request('/goals/current', { query: { date } }),
    create: (body) => request('/goals', { method: 'POST', body }),
    update: (id, body) => request(`/goals/${id}`, { method: 'PUT', body }),
  },
};
