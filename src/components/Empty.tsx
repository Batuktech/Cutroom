import { Film, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
export function Empty({
  icon: Icon,
  title,
  copy,
  action,
  onClick,
}: {
  icon: typeof Film;
  title: string;
  copy: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-section large-empty">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h2>{title}</h2>
      <p>{copy}</p>
      <Button variant="secondary" onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
