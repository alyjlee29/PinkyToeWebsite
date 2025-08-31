import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { API_ROUTES, PLACEHOLDER_IMAGE } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { getImageUrl, getPhotoUrl } from "@/lib/image-helper";
import { fetchTeamMemberById, fetchArticlesByTeamMemberId } from "@/lib/api";

export default function TeamMemberDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: teamMember, isLoading: teamLoading, error: teamError } = useQuery({
    queryKey: [API_ROUTES.TEAM_MEMBER_BY_ID(id!)],
    queryFn: () => fetchTeamMemberById(id!),
    enabled: !!id,
  });

  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: [`/api/team/${id}/articles`],
    queryFn: () => fetchArticlesByTeamMemberId(id!),
    enabled: !!teamMember && !!id,
  });

  const goBack = () => {
    setLocation('/team');
  };

  // Get the member image URL from MainImageLink if available, or use placeholder
  const memberImageUrl = teamMember && teamMember.imageUrl
    ? getImageUrl(teamMember.imageUrl)
    : PLACEHOLDER_IMAGE;

  if (teamMember) {
    console.log(`Team member ${teamMember.id} - Using imageUrl: ${teamMember.imageUrl || 'Not available, using placeholder'}`);
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          className="mb-4 flex items-center text-primary hover:text-pinky-dark"
          onClick={goBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Team
        </Button>

        {teamLoading ? (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="md:flex">
                <div className="md:w-1/3 mb-6 md:mb-0 md:pr-6">
                  <Skeleton className="w-full h-64 rounded-lg" />
                  <Skeleton className="h-6 w-3/4 mt-4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </div>
                <div className="md:w-2/3">
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : teamError ? (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="font-quicksand font-bold text-2xl text-red-500 mb-4">Error</h2>
            <p className="text-gray-700">Failed to load team member profile. Please try again later.</p>
          </div>
        ) : teamMember ? (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="md:flex">
                <div className="md:w-1/3 mb-6 md:mb-0 md:pr-6">
                  <img
                    src={memberImageUrl}
                    alt={`${teamMember.name} photo`}
                    className="w-full rounded-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      console.error(`Failed to load team image: ${target.src}`);
                      target.src = PLACEHOLDER_IMAGE;
                    }}
                  />

                  <div className="mt-4">
                    <h3 className="font-quicksand font-bold text-xl text-pinky-dark">{teamMember.name}</h3>
                    <p className="text-primary font-semibold">{teamMember.role}</p>
                  </div>
                </div>

                <div className="md:w-2/3">
                  <div className="prose max-w-none">
                    <p className="whitespace-pre-line">{teamMember.bio}</p>
                  </div>

                  {articles && articles.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-quicksand font-bold text-xl text-pinky-dark mb-4">
                        Recent Articles by {teamMember.name}
                      </h3>

                      <div className="space-y-4">
                        {articlesLoading ? (
                          <div className="space-y-4">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                          </div>
                        ) : (
                          articles.map((article: any) => {
                            // Get proper image URL for article from MainImageLink or use placeholder
                            const articleImageUrl = article.imageUrl
                              ? getImageUrl(article.imageUrl)
                              : PLACEHOLDER_IMAGE;

                            return (
                              <div key={article.id} className="flex border-b border-gray-200 pb-3">
                                <img
                                  src={articleImageUrl}
                                  alt={article.title}
                                  className="w-20 h-20 object-cover rounded mr-4"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    console.error(`Failed to load article image: ${target.src}`);
                                    target.src = PLACEHOLDER_IMAGE;
                                  }}
                                />
                                <div>
                                  <Link href={`/articles/${article.id}`}>
                                    <div className="font-quicksand font-semibold text-pinky-dark hover:text-primary transition-colors cursor-pointer">
                                      {article.title}
                                    </div>
                                  </Link>
                                  <p className="text-gray-500 text-sm">{formatDate(article.publishedAt)}</p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
