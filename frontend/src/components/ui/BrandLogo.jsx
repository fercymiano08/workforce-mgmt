import clsx from 'clsx';
import logo from '../../assets/logo.png';

const sizeMap = {
  icon: 'w-10 h-10',
  large: 'w-16 h-16',
};

export default function BrandLogo({ variant = 'icon', className }) {
  return (
    <img
      src={logo}
      alt="ARCHON NELL"
      className={clsx('rounded-full object-contain flex-shrink-0', sizeMap[variant], className)}
    />
  );
}
