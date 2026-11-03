import { formatNetWorth, getNetWorthTier } from './data/netWorth.js';

function createDetail(label, value) {
  const detail = document.createElement('p');
  detail.className = 'person-card__detail';
  detail.title = `${label}: ${value}`;
  const labelElement = document.createElement('span');
  labelElement.textContent = `${label}: `;
  const valueElement = document.createElement('span');
  valueElement.textContent = value;
  detail.append(labelElement, valueElement);
  return detail;
}

export function createPeopleCard(person) {
  const tier = getNetWorthTier(person.netWorth);
  const card = document.createElement('article');
  card.className = getPeopleCardClass(person);
  card.dataset.personId = String(person.id);

  const photoContainer = document.createElement('div');
  photoContainer.className = 'person-card__photo';
  const image = document.createElement('img');
  image.src = person.photo;
  image.alt = `Portrait of ${person.name}`;
  image.loading = 'lazy';
  image.decoding = 'async';

  const fallback = document.createElement('div');
  fallback.className = 'person-card__photo-fallback';
  fallback.textContent = 'Photo unavailable';
  fallback.hidden = true;
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });
  photoContainer.append(image, fallback);

  const name = document.createElement('h2');
  name.className = 'person-card__name';
  name.textContent = person.name;
  name.title = person.name;

  const details = document.createElement('div');
  details.className = 'person-card__details';
  details.append(
    createDetail('Age', String(person.age)),
    createDetail('Country', person.country),
    createDetail('Interest', person.interest),
    createDetail('Net Worth', formatNetWorth(person.netWorth)),
  );

  card.append(photoContainer, name, details);
  return card;
}

export function getPeopleCardClass(person) {
  return `person-card tier-${getNetWorthTier(person.netWorth)}`;
}
