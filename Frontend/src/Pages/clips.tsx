import { Clapperboard } from 'lucide-react';
import { useState } from 'react';
import { useClipping } from '../Context/ClippingContext';
import ContentPage from '../Components/ContentPage';
import ContentCard from '../Components/ContentCard';

export default function Clips() {
  const { clippingProgress } = useClipping();
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'favorites'>('all');

  // Pre-render the progress card element
  const progressCardElement =
    Object.keys(clippingProgress).length > 0 ? (
      <ContentCard key="clipping-progress" type="Clip" isLoading />
    ) : null;

  return (
    <ContentPage
      contentType="Clip"
      contentTypes={['Clip', 'Buffer']}
      sectionId="clips"
      title="Clips"
      Icon={Clapperboard}
      progressItems={clippingProgress}
      isProgressVisible={Object.keys(clippingProgress).length > 0}
      progressCardElement={progressCardElement}
      favoriteFilter={favoriteFilter}
      onFavoriteFilterChange={setFavoriteFilter}
    />
  );
}
