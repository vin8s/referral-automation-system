import { cn } from '@/lib/utils';

interface PageHeadProps {
  title: string;
  sub?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHead({ title, sub, children, className }: PageHeadProps) {
  return (
    <div className={cn('pg-head', className)}>
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="right">{children}</div>}
    </div>
  );
}
