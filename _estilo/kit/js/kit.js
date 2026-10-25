(function () {
  'use strict';

  // 1. Interruptor (Switch)
  var switches = document.querySelectorAll('.rc-switch');
  switches.forEach(function (sw) {
    sw.addEventListener('click', function () {
      var activo = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', String(!activo));
    });
  });

  // 2. Control deslizante (Slider)
  var sliderInput = document.getElementById('rc-slider-input');
  var sliderProgreso = document.getElementById('rc-slider-progreso');
  var sliderPerilla = document.getElementById('rc-slider-perilla');

  function actualizarSlider() {
    if (!sliderInput || !sliderProgreso || !sliderPerilla) return;
    var min = Number(sliderInput.min) || 0;
    var max = Number(sliderInput.max) || 100;
    var val = Number(sliderInput.value) || 0;
    var pct = ((val - min) / (max - min)) * 100;
    sliderProgreso.style.width = pct + '%';
    sliderPerilla.style.left = pct + '%';
  }

  if (sliderInput) {
    sliderInput.addEventListener('input', actualizarSlider);
    actualizarSlider();
  }

  // 3. Pestañas flotantes (Tabs)
  var tablists = document.querySelectorAll('[role="tablist"]');
  tablists.forEach(function (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab, idx) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.setAttribute('aria-selected', 'false');
        });
        tab.setAttribute('aria-selected', 'true');
      });

      tab.addEventListener('keydown', function (e) {
        var targetIdx = idx;
        if (e.key === 'ArrowRight') {
          targetIdx = (idx + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
          targetIdx = (idx - 1 + tabs.length) % tabs.length;
        } else {
          return;
        }
        e.preventDefault();
        tabs[targetIdx].focus();
        tabs[targetIdx].click();
      });
    });
  });

  // 4. Navegacion lateral y paginacion interactiva
  var navContainers = document.querySelectorAll('.rc-nav-lateral');
  navContainers.forEach(function (nav) {
    var items = nav.querySelectorAll('.rc-nav-item');
    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        items.forEach(function (el) {
          el.classList.remove('rc-nav-item--activo');
          var ico = el.querySelector('.rc-icono');
          if (ico) ico.classList.remove('rc-icono--azul');
        });
        item.classList.add('rc-nav-item--activo');
        var iconoActivo = item.querySelector('.rc-icono');
        if (iconoActivo) iconoActivo.classList.add('rc-icono--azul');
      });
    });
  });

  var pagBtns = document.querySelectorAll('.rc-paginacion .rc-pagina-btn');
  pagBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var texto = btn.textContent.trim();
      if (texto === '‹' || texto === '›') return;
      pagBtns.forEach(function (b) {
        b.classList.remove('rc-pagina-btn--activa');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('rc-pagina-btn--activa');
      btn.setAttribute('aria-current', 'page');
    });
  });

  // 5. Seleccion de filas en tabla
  var filasTabla = document.querySelectorAll('.rc-tabla__fila');
  filasTabla.forEach(function (fila) {
    fila.addEventListener('click', function () {
      filasTabla.forEach(function (f) {
        f.classList.remove('rc-tabla__fila--seleccionada');
      });
      fila.classList.add('rc-tabla__fila--seleccionada');
    });
  });

  // 6. Cierre suave de Toasts y Modal (con restauracion al hacer doble clic o tras unos segundos en demo)
  var botonesCerrarToast = document.querySelectorAll('.rc-toast .rc-toast__cerrar');
  botonesCerrarToast.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var toast = btn.closest('.rc-escena-vidrio');
      if (!toast) return;
      toast.style.opacity = '0.35';
      setTimeout(function () {
        toast.style.opacity = '1';
      }, 1400);
    });
  });

  var modal = document.querySelector('.rc-modal');
  if (modal) {
    var botonesModal = modal.querySelectorAll('button');
    botonesModal.forEach(function (b) {
      b.addEventListener('click', function () {
        modal.style.transform = 'scale(0.98)';
        setTimeout(function () {
          modal.style.transform = 'scale(1)';
        }, 180);
      });
    });
  }

  // 7. Menu desplegable interactivo
  var itemsMenu = document.querySelectorAll('.rc-menu__item');
  itemsMenu.forEach(function (item) {
    item.addEventListener('click', function () {
      itemsMenu.forEach(function (i) {
        i.removeAttribute('aria-current');
      });
      item.setAttribute('aria-current', 'true');
    });
  });

  // 8. Tooltip accesible al foco y hover
  var tooltipDemo = document.querySelector('.rc-tooltip-demo');
  if (tooltipDemo) {
    var trigger = tooltipDemo.querySelector('button');
    var tooltip = tooltipDemo.querySelector('.rc-tooltip');
    if (trigger && tooltip) {
      trigger.addEventListener('focus', function () {
        tooltip.setAttribute('aria-hidden', 'false');
      });
      trigger.addEventListener('blur', function () {
        tooltip.setAttribute('aria-hidden', 'false');
      });
    }
  }

  // 9. Contador de notificaciones interactivo
  var badge = document.getElementById('rc-contador-badge');
  if (badge) {
    badge.parentElement.addEventListener('click', function () {
      var actual = parseInt(badge.textContent, 10) || 0;
      badge.textContent = String((actual % 9) + 1);
    });
  }

  // 10. Formulario de mensajeria
  var formChat = document.getElementById('rc-form-chat');
  var inputChat = document.getElementById('rc-input-chat');
  if (formChat && inputChat) {
    formChat.addEventListener('submit', function (e) {
      e.preventDefault();
      var texto = inputChat.value.trim();
      if (!texto) return;
      var contenedorProp = document.querySelector('.rc-burbuja--propia .rc-burbuja__texto');
      if (contenedorProp) {
        contenedorProp.textContent = texto;
      }
      inputChat.value = '';
    });
  }
})();
