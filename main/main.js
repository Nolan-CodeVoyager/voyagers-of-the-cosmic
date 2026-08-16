// =============================================================================
// MAIN.JS — скрипт главной страницы
// Плавная прокрутка к секции виджета и анимация появления блоков
// =============================================================================

// --- Элементы DOM, с которыми работает скрипт главной страницы ---
const siteHeader = document.getElementById('siteHeader');       // фиксированная шапка
const scrollDownBtn = document.getElementById('scrollDownBtn'); // кнопка «Перейти к чату»
const mainSection = document.getElementById('main-section');     // блок с iframe-виджетом
const aboutSection = document.getElementById('about-section');
const inklingSection = document.getElementById('inkling-section');   // блок «О проекте»

// Плавный скролл к основному блоку с виджетом (без перезагрузки страницы)
scrollDownBtn.addEventListener('click', () => {
  const offset = 170;
  window.scrollTo({
    top: mainSection.offsetTop + offset,
    behavior: 'smooth'
  });
});




// При прокрутке > 40px добавляем класс .scrolled — шапка получает тень и плотнее фон
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    siteHeader.classList.add('scrolled');
  } else {
    siteHeader.classList.remove('scrolled');
  }
});

// Intersection Observer: следит, когда секция попадает в viewport,
// и добавляет класс .visible — включается CSS-анимация fade-in + slide-up
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  // threshold 0.15 — срабатывает, когда видно ~15% секции
  // rootMargin снизу — чуть раньше триггерим анимацию при скролле
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);

revealObserver.observe(mainSection);
revealObserver.observe(inklingSection);
revealObserver.observe(aboutSection);