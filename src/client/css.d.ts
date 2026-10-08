declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export function mountStyles(): () => void;
  export default classes;
}

declare module "*.css";
