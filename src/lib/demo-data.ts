export type Team = { id: string; name: string; slug?: string; short: string; area: string; players: number; status: string; color: string };
export const teams: Team[] = [
  { id: "falcons", name: "Peshawar Falcons", short: "PF", area: "University Town", players: 12, status: "Looking for a match", color: "blue" },
  { id: "royal", name: "Royal Strikers", short: "RS", area: "Hayatabad", players: 14, status: "Available Sunday", color: "gold" },
  { id: "frontier", name: "Frontier XI", short: "FX", area: "Board Bazaar", players: 11, status: "Match confirmed", color: "green" },
  { id: "legends", name: "Peshawar Legends", short: "PL", area: "Dabgari", players: 9, status: "Looking for a match", color: "purple" }
];
export const fixtures = [
  { id: "m1", home: "Peshawar Falcons", away: "Royal Strikers", date: "Sunday, 16 November", time: "9:00 AM", ground: "Peshawar Sports Complex", state: "Confirmed" },
  { id: "m2", home: "Frontier XI", away: "Peshawar Legends", date: "Sunday, 16 November", time: "10:00 AM", ground: "University Town Ground", state: "Request pending" }
];
