import { Car, Footprints, TrainFront } from "lucide-react";

export const ROUTE_COLORS = [
  {
    bar: "border-l-route-1",
    bg: "bg-route-1/10",
    text: "text-route-1",
    dot: "bg-route-1",
    hex: "#6898d3",
  },
  {
    bar: "border-l-route-2",
    bg: "bg-route-2/10",
    text: "text-route-2",
    dot: "bg-route-2",
    hex: "#4cb290",
  },
  {
    bar: "border-l-route-3",
    bg: "bg-route-3/10",
    text: "text-route-3",
    dot: "bg-route-3",
    hex: "#ce9358",
  },
  {
    bar: "border-l-route-4",
    bg: "bg-route-4/10",
    text: "text-route-4",
    dot: "bg-route-4",
    hex: "#9d82c9",
  },
  {
    bar: "border-l-route-5",
    bg: "bg-route-5/10",
    text: "text-route-5",
    dot: "bg-route-5",
    hex: "#c66b7a",
  },
];

export const TRANSPORT = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "drive", label: "Drive", icon: Car },
  { key: "transit", label: "Transit", icon: TrainFront },
] as const;

export type TransportMode = "walk" | "drive" | "transit";
