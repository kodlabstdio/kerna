export const proofComponents = {
  ProofColumns: {
    label: "Proof Columns",
    variants: ["split"],
    fields: {},
    slots: {
      left: { accepts: ["ProofText"], min: 1, max: 3 },
      right: { accepts: ["ProofText"], min: 0, max: 3 },
    },
  },
  ProofText: {
    label: "Proof Text",
    variants: ["plain", "emphasis"],
    fields: { title: { type: "text", required: true }, count: { type: "number", required: true } },
    slots: {},
  },
};
export const proofPage = {
  formatVersion: 1,
  root: { props: {} },
  content: [
    {
      type: "ProofColumns",
      props: {
        id: "parent",
        variant: "split",
        left: [
          {
            type: "ProofText",
            props: { id: "child", variant: "plain", title: "Nested Block", count: 1 },
          },
        ],
        right: [],
      },
    },
  ],
};
export const proofBinding = { token: "a".repeat(64), session: "fixture-session", generation: 1 };

// Complete site-owned content, not inferred defaults from field schemas.
export const proofPresets = {
  Hero: { type: "Hero", props: { id: "preset-hero", variant: "centered", title: "Welcome" } },
  ProofText: {
    type: "ProofText",
    props: { id: "preset-text", variant: "plain", title: "New text", count: 1 },
  },
  ProofColumns: {
    type: "ProofColumns",
    props: {
      id: "preset-columns",
      variant: "split",
      left: [
        {
          type: "ProofText",
          props: { id: "preset-left", variant: "plain", title: "Column text", count: 1 },
        },
      ],
      right: [],
    },
  },
};

// Shared public/preview parity fixture covers every enabled renderer at root,
// as well as the nested Block; the browser editing fixture stays unchanged.
export const proofRenderPage = {
  ...proofPage,
  content: [...proofPage.content, proofPresets.ProofText, proofPresets.Hero],
};
