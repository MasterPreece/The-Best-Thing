import React from 'react';
import './SkeletonLoader.css';

export const ComparisonSkeleton = () => {
  return (
    <div className="comparison-container">
      <div className="comparison-header">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-subtitle"></div>
      </div>
      
      <div className="comparison-grid">
        <div className="comparison-item skeleton-item">
          <div className="skeleton skeleton-image"></div>
          <div className="item-info">
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text-short"></div>
          </div>
        </div>
        
        <div className="vs-divider skeleton-vs">VS</div>
        
        <div className="comparison-item skeleton-item">
          <div className="skeleton skeleton-image"></div>
          <div className="item-info">
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text-short"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RankingSkeleton = ({ count = 5 }) => {
  return (
    <div className="rankings-container">
      <div className="rankings-header">
        <div className="skeleton skeleton-title-large"></div>
      </div>
      
      <div className="rankings-list">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="ranking-item skeleton-ranking">
            <div className="skeleton skeleton-rank-number"></div>
            <div className="skeleton skeleton-rank-image"></div>
            <div className="rank-info" style={{ flex: 1 }}>
              <div className="skeleton skeleton-text"></div>
              <div className="skeleton skeleton-text-short"></div>
            </div>
            <div className="rank-stats">
              <div className="skeleton skeleton-stat"></div>
              <div className="skeleton skeleton-stat"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { ItemDetailSkeleton } from './ItemDetailSkeleton';

export default ComparisonSkeleton;

