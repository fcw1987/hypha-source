const button = document.querySelector('#copy-link');
const label = document.querySelector('#copy-label');
const status = document.querySelector('#copy-status');
const manualCopy = document.querySelector('#manual-copy');
const input = document.querySelector('#page-link');
const publicUrl = document.querySelector('link[rel="canonical"]').href;
let resetLabel;

button.hidden = false;
button.addEventListener('click', async () => {
  clearTimeout(resetLabel);
  try {
    await navigator.clipboard.writeText(publicUrl);
    manualCopy.hidden = true;
    label.textContent = 'Link copied';
    status.textContent = 'Public page link copied.';
    resetLabel = setTimeout(() => {
      label.textContent = 'Copy page link';
      status.textContent = '';
    }, 3000);
  } catch {
    label.textContent = 'Copy page link';
    manualCopy.hidden = false;
    input.value = publicUrl;
    input.focus();
    input.select();
    status.textContent = 'Public page link selected for copying.';
  }
});

manualCopy.addEventListener('focusout', () => { manualCopy.hidden = true; });
input.addEventListener('keydown', event => {
  if (event.key === 'Escape') button.focus();
});
