const card = document.getElementById('character-card');
const cardToggle = document.getElementById('mobile-card-toggle');
const inbox = document.getElementById('inbox-panel');
const inboxToggle = document.getElementById('mobile-inbox-toggle');
const inboxClose = document.getElementById('mobile-inbox-close');

function setCardOpen(open) {
  document.body.classList.toggle('mobile-card-closed', !open);
  cardToggle?.setAttribute('aria-expanded', String(open));
  if (cardToggle) cardToggle.textContent = open ? 'Карта' : 'Карточка';
}

function setInboxOpen(open, restoreFocus = true) {
  document.body.classList.toggle('mobile-inbox-open', open);
  inboxToggle?.setAttribute('aria-expanded', String(open));
  inbox?.setAttribute('aria-hidden', String(!open));
  if (open) inboxClose?.focus();
  else if (restoreFocus) inboxToggle?.focus();
}

cardToggle?.addEventListener('click', () => {
  setCardOpen(document.body.classList.contains('mobile-card-closed'));
});

inboxToggle?.addEventListener('click', () => {
  setInboxOpen(!document.body.classList.contains('mobile-inbox-open'));
});

inboxClose?.addEventListener('click', () => setInboxOpen(false));

document.getElementById('preview')?.addEventListener('click', () => setInboxOpen(false, false));
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    document.body.classList.toggle('mobile-secondary-context', button.dataset.mode !== 'session');
    setInboxOpen(false, false);
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('mobile-inbox-open')) {
    setInboxOpen(false);
  }
});
