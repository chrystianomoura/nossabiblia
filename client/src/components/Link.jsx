import { navigate } from '../lib/router';

// Link que respeita clique com modificador (nova aba) e clique do meio.
export default function Link({ to, replace, position, onClick, ...props }) {
  function handleClick(event) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      props.target === '_blank'
    ) return;
    event.preventDefault();
    navigate(to, { replace, position });
  }

  return <a href={to} {...props} onClick={handleClick} />;
}
