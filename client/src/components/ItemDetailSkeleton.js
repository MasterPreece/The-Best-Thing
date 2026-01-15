import React from 'react';
import './SkeletonLoader.css';

export const ItemDetailSkeleton = () => {
  return (
    <div className="item-detail-container">
      <div className="item-detail-content skeleton-detail">
        <div className="item-main">
          <div className="skeleton skeleton-image" style={{ maxWidth: '400px', height: '400px', borderRadius: '10px' }}></div>
          <div className="item-info-section" style={{ flex: 1 }}>
            <div className="skeleton skeleton-title" style={{ width: '60%', height: '40px', marginBottom: '20px' }}></div>
            <div className="skeleton skeleton-text-short" style={{ width: '90%', marginBottom: '10px' }}></div>
            <div className="skeleton skeleton-text-short" style={{ width: '80%', marginBottom: '10px' }}></div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginTop: '20px' }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '8px' }}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

