import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>);
export const IconTasks = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 1.5 1.5L11 8" /><path d="M14 9.5h3" /><path d="m7 15 1.5 1.5L11 14" /><path d="M14 15.5h3" /></svg>);
export const IconFocus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" /></svg>);
export const IconBuddies = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4" /></svg>);
export const IconProgress = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>);
export const IconProfile = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></svg>);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconMic = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const IconMicOff = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5" /><path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></svg>);
export const IconCam = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></svg>);
export const IconCamOff = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15.5 13v3a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1M9 6h4.5a2 2 0 0 1 2 2v2.5l6-3.5v10M3 3l18 18" /></svg>);
export const IconChat = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z" /></svg>);
export const IconLeave = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>);
export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IconFlag = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 5v14M15 5v14" /></svg>);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 4.5v15l12-7.5z" /></svg>);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>);
