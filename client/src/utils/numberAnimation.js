/**
 * Animates a number from start to end value
 */
export const animateNumber = (element, start, end, duration = 1000, callback) => {
  if (!element) return;
  
  const startTime = performance.now();
  const difference = end - start;
  
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (easeOutCubic)
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + difference * eased);
    
    element.textContent = current.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      element.textContent = end.toLocaleString();
      if (callback) callback();
    }
  };
  
  requestAnimationFrame(animate);
};

/**
 * Format number with commas and optional suffix
 */
export const formatNumber = (num, suffix = '') => {
  return num.toLocaleString() + (suffix ? ` ${suffix}` : '');
};

